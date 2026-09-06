/*
This script will be executed after a user that signed-up, and follows the 'verification' link. The parameter: email is used to verify an account.
*/

function verify(emailInput, callback) {
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
    });

    connection.query(
      "UPDATE User SET emailVerified = true WHERE emailVerified = false AND email = ? LIMIT 1",
      [email],
      function (updateError, result) {
        if (updateError) return rollbackAndFinish(updateError);
        // UPDATE queries resolve to an OkPacket (affectedRows/changedRows),
        // not an array of rows, so `.length` is always undefined here.
        if (!result || result.affectedRows === 0) {
          return rollbackAndFinish(
            new ValidationError(
              "verification_failed",
              `User with email "${email}" not found or already verified.`,
            ),
          );
        }
        commitAndFinish(true);
      },
    );
  });
}

// This script is a mirror of it's original counterpart used within the Auth0 platform. It is not used within this backend and only provided as context.
