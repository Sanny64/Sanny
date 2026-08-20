function create(user, callback) {
  const mysql = require("mysql");
  const bcrypt = require("bcrypt");
  const email = user.email.trim().toLowerCase();
  const connection = mysql.createConnection({
    host: configuration.DB_HOST,
    port: Number(configuration.DB_PORT || 3306),
    user: configuration.DB_USER,
    password: configuration.DB_PASSWORD,
    database: configuration.DB_NAME,
  });

  connection.connect(function (connectError) {
    if (connectError) return callback(connectError);
    connection.query(
      "SELECT id FROM User WHERE email = ? LIMIT 1",
      [email],
      function (lookupError, rows) {
        if (lookupError) {
          connection.end();
          return callback(lookupError);
        }
        if (rows.length > 0) {
          connection.end();
          return callback(
            new ValidationError(
              "user_exists",
              "A user with this email already exists.",
            ),
          );
        }
        bcrypt.hash(user.password, 12, function (hashError, passwordHash) {
          if (hashError) {
            connection.end();
            return callback(hashError);
          }
          connection.query(
            "INSERT INTO User (email, name, password) VALUES (?, ?, ?)",
            [email, user.name || email.split("@")[0], passwordHash],
            function (insertError) {
              connection.end();
              if (insertError) return callback(insertError);
              return callback(null);
            },
          );
        });
      },
    );
  });
}

// This script is a mirror of it's original counterpart used within the Auth0 platform. It is not used within this backend and only provided as context.
