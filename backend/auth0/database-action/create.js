/*
This script will be executed when the user signs up. The parameter: user is used to create a record in the user store.
*/

function create(user, callback) {
  const mysql = require("mysql");
  const bcrypt = require("bcrypt");
  const crypto = require("crypto");

  const getConfig = (name) => {
    const value = configuration[name];
    if (!value) throw new Error(`${name} configuration must be set`);
    return value;
  };
  const getOptionalConfig = (name, fallback) => {
    const value = configuration[name];
    return value === undefined || value === null || value === ""
      ? fallback
      : value;
  };
  // Signup policy is exposed via Auth0 configuration so it can be tuned without redeploying this script.
  const emailPolicy = {
    maxLength: Number(getOptionalConfig("EMAIL_MAX_LENGTH", 254)),
  };
  const usernamePolicy = {
    minLength: Number(getOptionalConfig("USERNAME_MIN_LENGTH", 3)),
    maxLength: Number(getOptionalConfig("USERNAME_MAX_LENGTH", 30)),
  };
  const passwordPolicy = {
    minLength: Number(getOptionalConfig("PASSWORD_MIN_LENGTH", 15)),
    maxBytes: Number(getOptionalConfig("PASSWORD_MAX_BYTES", 72)),
    minClassCount: Number(getOptionalConfig("PASSWORD_MIN_CLASS_COUNT", 3)),
  };
  const sslCa = getConfig("DB_SSL_CA")
    .replace(/\\n/g, "\n")
    .replace(/\s+/g, "")
    .replace("-----BEGINCERTIFICATE-----", "-----BEGIN CERTIFICATE-----\n")
    .replace("-----ENDCERTIFICATE-----", "\n-----END CERTIFICATE-----\n");

  const connection = mysql.createConnection({
    host: getConfig("DB_HOST"),
    port: Number(getConfig("DB_PORT")),
    user: getConfig("DB_USER"),
    password: getConfig("DB_PASSWORD"),
    database: getConfig("DB_NAME"),
    connectTimeout: 10000,
    ssl: { ca: sslCa, rejectUnauthorized: true },
  });

  /*
  Case 1: User exists with email/gmail + password and creates an email/gmail + password user, return error "email_user_exists".
  Case 2: User exists with a google-oauth2 sub and creates a Google user, return error "google_user_exists".
  Case 3: User exists with both gmail + password and google-oauth2 sub and creates another user using the same gmail, return error "user_exists". (shouldn't be possible in practice)
  Case 4: User exists with gmail + password and creates a Google user, return error "use_email_login".
  Case 5: User exists with a google-oauth2 sub and creates an gmail + password user, return error "use_google_login".
  Case 6: User does not exist and creates profile via email/gmail + password, create the user and set id, name, email, password.
  Case 7: User does not exist and logs in via Google, create the user and set the id, name email, auth0Sub.
  Case 8: Validation error, return an error. (should not happen in practice unless more social logins are added)
  */

  function finish(err, result) {
    connection.end(function () {
      if (err) return callback(err);
      return callback(null, result);
    });
  }

  function rollbackAndFinish(err) {
    connection.rollback(function () {
      finish(err, null);
    });
  }

  function commitAndFinish(result) {
    connection.commit(function (commitError) {
      if (commitError) {
        return connection.rollback(function () {
          finish(commitError);
        });
      }
      finish(null, result);
    });
  }

  function hasSequentialOrRepeatedChars(str) {
    // This function needs to be adjusted if the password policy changes.
    for (let i = 0; i < str.length - 2; i++) {
      const a = str.charCodeAt(i);
      const b = str.charCodeAt(i + 1);
      const c = str.charCodeAt(i + 2);

      const identical = a === b && b === c;
      const ascending = b === a + 1 && c === b + 1;
      const descending = b === a - 1 && c === b - 1;

      if (identical || ascending || descending) {
        return true;
      }
    }
    return false;
  }

  function validateUserInput(user) {
    // This function needs to be adjusted if the password, username or email policy changes.
    const errors = {};

    const email = (user.email || "").trim().toLowerCase();
    const emailRegex =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    if (!email) {
      errors.email = "Email is required.";
    } else if (
      !emailRegex.test(email) ||
      email.length > emailPolicy.maxLength
    ) {
      errors.email = "Invalid email format.";
    }

    const username = (user.username || "").trim();
    const looksLikeEmail = /@/.test(username);
    const looksLikePhone = /^\+[1-9]\d{7,14}$/.test(username);
    if (!username) {
      errors.username = "Username is required.";
    } else if (
      username.length < usernamePolicy.minLength ||
      username.length > usernamePolicy.maxLength
    ) {
      errors.username = `Username must be between ${usernamePolicy.minLength} and ${usernamePolicy.maxLength} characters.`;
    } else if (looksLikeEmail) {
      errors.username = "Username must not be an email address.";
    } else if (looksLikePhone) {
      errors.username = "Username must not be a phone number.";
    }

    const password = user.password ? user.password.trim() : null;
    if (password) {
      const byteLength = Buffer.byteLength(password, "ascii");
      if (password.length < passwordPolicy.minLength) {
        errors.password = `Password must be at least ${passwordPolicy.minLength} characters.`;
      } else if (byteLength > passwordPolicy.maxBytes) {
        errors.password = `Password must not exceed ${passwordPolicy.maxBytes} bytes (${passwordPolicy.maxBytes} regular characters).`;
      } else {
        const hasUpper = /[A-Z]/.test(password);
        const hasLower = /[a-z]/.test(password);
        const hasDigit = /[0-9]/.test(password);
        const hasSpecial = /[^A-Za-z0-9]/.test(password);
        const classCount = [hasUpper, hasLower, hasDigit, hasSpecial].filter(
          Boolean,
        ).length;
        if (classCount < passwordPolicy.minClassCount) {
          errors.password = `Password must contain at least ${passwordPolicy.minClassCount} of the following: uppercase letter, lowercase letter, number, special character.`;
        } else if (hasSequentialOrRepeatedChars(password)) {
          errors.password =
            "Password must not contain 3 or more sequential or identical characters in a row.";
        }
      }
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
      email,
      username,
      password,
    };
  }

  const validation = validateUserInput(user);
  if (!validation.valid) {
    return callback(
      new ValidationError(
        "invalid_input",
        `The input provided for the user with email: "${validation.email}" is invalid: ${JSON.stringify(
          validation.errors,
        )}`,
      ),
    );
  }

  const email = validation.email;
  const password = validation.password;

  connection.connect(function (connectError) {
    if (connectError) {
      connection.destroy();
      return callback(connectError);
    }

    connection.beginTransaction(function (txError) {
      if (txError) {
        return finish(txError);
      }

      connection.query(
        "SELECT id, username, (password IS NOT NULL) as hasPassword, auth0Sub " +
          "FROM User WHERE email = ? LIMIT 1 FOR UPDATE",
        [email],
        function (lookupError, rows) {
          if (lookupError) {
            return rollbackAndFinish(lookupError);
          }

          // Always hash some string even if it's not password, to prevent timing side-channel attacks.
          bcrypt.hash(
            password || crypto.randomBytes(16).toString("hex"),
            12,
            function (hashError, passwordHash) {
              if (hashError) {
                return rollbackAndFinish(hashError);
              }
              // Case 1
              if (rows.length > 0 && rows[0].hasPassword && password) {
                return rollbackAndFinish(
                  new ValidationError(
                    "email_user_exists",
                    `A user with the email "${email}" already exists.`,
                  ),
                );
              } else
                // Case 2
                if (
                  rows.length > 0 &&
                  rows[0].auth0Sub &&
                  rows[0].auth0Sub.startsWith("google-oauth2|") &&
                  user.auth0Sub &&
                  user.auth0Sub.startsWith("google-oauth2|")
                ) {
                  return rollbackAndFinish(
                    new ValidationError(
                      "google_user_exists",
                      `A user with the google connection for "${user.email}" already exists.`,
                    ),
                  );
                } else
                  // Case 3
                  if (
                    rows.length > 0 &&
                    rows[0].hasPassword &&
                    rows[0].auth0Sub &&
                    rows[0].auth0Sub.startsWith("google-oauth2|")
                  ) {
                    return rollbackAndFinish(
                      new ValidationError(
                        "user_exists",
                        `A user with the email "${email}" and google connection already exists.`,
                      ),
                    );
                  } else
                    // Case 4
                    if (
                      rows.length > 0 &&
                      rows[0].hasPassword &&
                      user.auth0Sub &&
                      user.auth0Sub.startsWith("google-oauth2|")
                    ) {
                      return rollbackAndFinish(
                        new ValidationError(
                          "use_email_login",
                          `An account with the email "${email}" already exists with a password. ` +
                            `Please log in with your email and password instead of "Continue with Google".`,
                        ),
                      );
                    } else
                      // Case 5
                      if (
                        rows.length > 0 &&
                        rows[0].auth0Sub &&
                        rows[0].auth0Sub.startsWith("google-oauth2|") &&
                        password
                      ) {
                        return rollbackAndFinish(
                          new ValidationError(
                            "use_google_login",
                            `An account with the email "${email}" already exists via Google. ` +
                              `Please use "Continue with Google" to sign in. If you'd like to add a ` +
                              `password to that account, sign in with Google first, then use ` +
                              `"Forgot password" to set one.`,
                          ),
                        );
                      } else
                        // Case 6
                        if (rows.length === 0 && password) {
                          connection.query(
                            "INSERT INTO User (email, username, password, emailVerified) VALUES (?, ?, ?, 1)",
                            [email, user.username, passwordHash],
                            function (insertError, insertResult) {
                              if (insertError) {
                                return rollbackAndFinish(insertError);
                              }
                              connection.query(
                                "UPDATE User SET auth0Sub = CONCAT('auth0|', id) WHERE id = ?",
                                [insertResult.insertId],
                                function (subjectError) {
                                  if (subjectError) {
                                    return rollbackAndFinish(subjectError);
                                  }
                                  return commitAndFinish({
                                    id: String(insertResult.insertId),
                                  });
                                },
                              );
                            },
                          );
                          return;
                        } else
                          // Case 7
                          if (
                            rows.length === 0 &&
                            user.auth0Sub &&
                            user.auth0Sub.startsWith("google-oauth2|")
                          ) {
                            connection.query(
                              "INSERT INTO User (email, username, auth0Sub, emailVerified) VALUES (?, ?, ?, 1)",
                              [email, user.username, user.auth0Sub],
                              function (insertError) {
                                if (insertError) {
                                  return rollbackAndFinish(insertError);
                                }
                                return commitAndFinish();
                              },
                            );
                            return;
                          } else {
                            // Case 8
                            return rollbackAndFinish(
                              new ValidationError(
                                "unexpected_case",
                                `Your create request for the email: "${email}" didn't match any known patterns: Please reach out to the support team at \`s4nny64@gmail.com\` for further assistance.`,
                              ),
                            );
                          }
            },
          );
        },
      );
    });
  });
}

// This script is a mirror of it's original counterpart used within the Auth0 platform. It is not used within this backend and only provided as context.
