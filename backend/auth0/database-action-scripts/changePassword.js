/*
This script will be executed when the user changes their password, the reset email was sent and the user follows the 'change password' link. 
The parameters: email and newPassword are used to confirm the new password.
*/

function changePassword(emailInput, newPassword, callback) {
  const mysql = require("mysql");
  const bcrypt = require("bcrypt");

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
  // Password policy is exposed via Auth0 configuration so it can be tuned without redeploying this script.
  const passwordPolicy = {
    minLength: Number(getOptionalConfig("PASSWORD_MIN_LENGTH", 15)),
    maxBytes: Number(getOptionalConfig("PASSWORD_MAX_BYTES", 72)),
    minClassCount: Number(getOptionalConfig("PASSWORD_MIN_CLASS_COUNT", 3)),
  };
  const emailPolicy = {
    maxLength: Number(getOptionalConfig("EMAIL_MAX_LENGTH", 254)),
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

  function finish(err, result) {
    connection.end(function () {
      if (err) return callback(err);
      return callback(null, result);
    });
  }

  function rollbackAndFinish(err, result) {
    connection.rollback(function () {
      finish(err, result);
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

  function isSamePasswordAsCurrent(currentHash, candidatePassword, done) {
    if (!currentHash) {
      return done(null, false);
    }
    bcrypt.compare(
      candidatePassword,
      currentHash,
      function (compareError, isMatch) {
        if (compareError) {
          return done(compareError);
        }
        return done(null, isMatch);
      },
    );
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

  function validateUserInput(emailInput, newPassword) {
    const errors = {};

    function validateEmail(emailInput) {
      const email = (emailInput || "").trim().toLowerCase();
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
      return email;
    }

    function validatePassword(newPassword) {
      const password = newPassword ? newPassword.trim() : null;
      if (!password) {
        errors.password = "New password is required.";
        return password;
      }
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
      return password;
    }

    const email = validateEmail(emailInput);
    const password = validatePassword(newPassword);

    return {
      valid: Object.keys(errors).length === 0,
      errors,
      email,
      password,
    };
  }

  const validation = validateUserInput(emailInput, newPassword);
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
        "SELECT password FROM User WHERE email = ? LIMIT 1 FOR UPDATE",
        [email],
        function (lookupError, rows) {
          if (lookupError) {
            return rollbackAndFinish(lookupError);
          }

          if (rows.length === 0) {
            return rollbackAndFinish(
              new ValidationError(
                "user_not_found",
                `No user found for email: "${email}"`,
              ),
            );
          }

          isSamePasswordAsCurrent(
            rows[0].password,
            password,
            function (compareError, isSamePassword) {
              if (compareError) {
                return rollbackAndFinish(compareError);
              }
              if (isSamePassword) {
                return rollbackAndFinish(
                  new ValidationError(
                    "password_reuse",
                    "New password must be different from your current password.",
                  ),
                );
              }

              bcrypt.hash(password, 12, function (hashError, hashedPassword) {
                if (hashError) {
                  return rollbackAndFinish(hashError);
                }
                connection.query(
                  "UPDATE User SET password = ? WHERE email = ?",
                  [hashedPassword, email],
                  function (updateError, updateResult) {
                    if (updateError) {
                      return rollbackAndFinish(updateError);
                    }
                    if (!updateResult || updateResult.affectedRows === 0) {
                      return rollbackAndFinish(
                        new ValidationError(
                          "invalid_request",
                          "Unable to update password.",
                        ),
                      );
                    }
                    commitAndFinish(updateResult.affectedRows > 0);
                  },
                );
              });
            },
          );
        },
      );
    });
  });
}

// This script is a mirror of it's original counterpart used within the Auth0 platform. It is not used within this backend and only provided as context.
