/*
This script will be executed each time a user attempts to login. The two parameters: email and password, are used to validate the authenticity of the user.
*/

function login(emailInput, passwordInput, callback) {
  const mysql = require("mysql");
  const bcrypt = require("bcrypt");

  const sslCa = configuration.DB_SSL_CA.replace(/\\n/g, "\n")
    .replace(/\s+/g, "")
    .replace("-----BEGINCERTIFICATE-----", "-----BEGIN CERTIFICATE-----\n")
    .replace("-----ENDCERTIFICATE-----", "\n-----END CERTIFICATE-----\n");

  const connection = mysql.createConnection({
    host: configuration.DB_HOST,
    port: Number(configuration.DB_PORT || 3306),
    user: configuration.DB_USER,
    password: configuration.DB_PASSWORD,
    database: configuration.DB_NAME,
    connectTimeout: 10000,
    ssl: { ca: sslCa, rejectUnauthorized: true },
  });

  const email = emailInput.trim().toLowerCase();
  const password = passwordInput.trim();

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
        "SELECT id, username, email, password, emailVerified FROM User WHERE email = ? LIMIT 1 FOR UPDATE",
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

          bcrypt.compare(
            password,
            rows[0].password,
            function (compareError, isMatch) {
              if (compareError) {
                return rollbackAndFinish(compareError);
              }
              if (!isMatch) {
                return rollbackAndFinish(
                  new WrongUsernameOrPasswordError(
                    "invalid_credentials",
                    `Invalid username or password for email: "${email}"`,
                  ),
                );
              }
              return commitAndFinish({
                id: String(rows[0].id),
                email: rows[0].email,
                username: rows[0].username,
                name: rows[0].username,
                email_verified: Boolean(rows[0].emailVerified),
              });
            },
          );
        },
      );
    });
  });
}

// This script is a mirror of it's original counterpart used within the Auth0 platform. It is not used within this backend and only provided as context.
