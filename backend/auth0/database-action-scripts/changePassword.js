function changePassword(email, newPassword, callback) {
  const mysql = require("mysql");
  const bcrypt = require("bcrypt");
  const connection = mysql.createConnection({
    host: configuration.DB_HOST,
    port: Number(configuration.DB_PORT || 3306),
    user: configuration.DB_USER,
    password: configuration.DB_PASSWORD,
    database: configuration.DB_NAME,
  });
  const normalizedEmail = email.trim().toLowerCase();

  connection.connect(function (connectError) {
    if (connectError) return callback(connectError);

    connection.query(
      "SELECT password FROM User WHERE email = ? LIMIT 1",
      [normalizedEmail],
      function (lookupError, rows) {
        if (lookupError) {
          connection.end();
          return callback(lookupError);
        }
        if (rows.length === 0) {
          connection.end();
          // Keep this generic rather than confirming the email doesn't exist.
          return callback(new ValidationError("invalid_request", "Unable to update password."));
        }

        const currentHash = rows[0].password;

        bcrypt.compare(newPassword, currentHash, function (compareError, isSamePassword) {
          if (compareError) {
            connection.end();
            return callback(compareError);
          }
          if (isSamePassword) {
            connection.end();
            return callback(
              new ValidationError(
                "password_reuse",
                "New password must be different from your current password.",
              ),
            );
          }

          bcrypt.hash(newPassword, 12, function (hashError, hash) {
            if (hashError) {
              connection.end();
              return callback(hashError);
            }
            connection.query(
              "UPDATE User SET password = ? WHERE email = ?",
              [hash, normalizedEmail],
              function (updateError) {
                connection.end();
                if (updateError) return callback(updateError);
                callback(null);
              },
            );
          });
        });
      },
    );
  });
}

// This script is a mirror of it's original counterpart used within the Auth0 platform. It is not used within this backend and only provided as context.
