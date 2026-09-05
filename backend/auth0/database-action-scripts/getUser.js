/*
This script will be executed when the user changes their password to test if the user exists.
*/

function getByEmail(emailInput, callback) {
  const mysql = require("mysql");

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
        "SELECT id, username, email, emailVerified FROM User WHERE email = ? LIMIT 1 FOR UPDATE",
        [email],
        function (lookupError, rows) {
          if (lookupError) {
            return rollbackAndFinish(lookupError);
          }
          if (rows.length === 0) {
            return commitAndFinish(null);
          }
          return commitAndFinish({
            id: String(rows[0].id),
            email: rows[0].email,
            username: rows[0].username,
            // Keep parity with login.js: Auth0 normalizes the profile's
            // display "Name" and persisted email_verified flag from these
            // return values, not from our custom DB directly. Coerce
            // explicitly since some MySQL driver/connection configs return
            // TINYINT(1) as 1/0 rather than true/false, and downstream Post
            // Login Actions compare this with strict `=== true`.
            name: rows[0].username,
            email_verified: Boolean(rows[0].emailVerified),
          });
        },
      );
    });
  });
}

// This script is a mirror of it's original counterpart used within the Auth0 platform. It is not used within this backend and only provided as context.
