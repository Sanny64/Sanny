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
            email_verified: Boolean(rows[0].emailVerified),
            username: rows[0].username,
            name: rows[0].username,
          });
        },
      );
    });
  });
}

// This script is a mirror of it's original counterpart used within the Auth0 platform. It is not used within this backend and only provided as context.
