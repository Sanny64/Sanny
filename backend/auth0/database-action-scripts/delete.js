/*
This script will be executed when the user is deleted. The parameter: id is the user's internal database id.
*/

function remove(id, callback) {
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

  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return callback(new Error(`Invalid id: "${id}"`));
  }

  console.log(`Deleting user with id: ${userId}`);

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
        "DELETE FROM User WHERE id = ?",
        [userId],
        function (deleteError) {
          if (deleteError) {
            return rollbackAndFinish(deleteError);
          }
          // Auth0 deletion succeeded, commit database cleanup
          commitAndFinish(null);
        },
      );
    });
  });
}

// This script is a mirror of it's original counterpart used within the Auth0 platform. It is not used within this backend and only provided as context.
