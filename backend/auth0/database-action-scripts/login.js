function login(identifierValue, password, callback) {
  const mysql = require("mysql");
  const bcrypt = require("bcrypt");
  const connection = mysql.createConnection({
    host: configuration.DB_HOST,
    port: Number(configuration.DB_PORT || 3306),
    user: configuration.DB_USER,
    password: configuration.DB_PASSWORD,
    database: configuration.DB_NAME,
  });
  const email = identifierValue.trim().toLowerCase();
  connection.connect(function (connectError) {
    if (connectError) return callback(connectError);
    connection.query(
      "SELECT id, name, email, password FROM User WHERE email = ? LIMIT 1",
      [email],
      function (err, results) {
        if (err) {
          connection.end();
          return callback(err);
        }
        if (results.length === 0) {
          connection.end();
          return callback(new WrongUsernameOrPasswordError(identifierValue));
        }
        const user = results[0];
        bcrypt.compare(password, user.password, function (err, isValid) {
          connection.end();
          if (err || !isValid)
            return callback(
              err || new WrongUsernameOrPasswordError(identifierValue),
            );

          callback(null, {
            user_id: String(user.id),
            username: user.name,
            email: user.email,
          });
        });
      },
    );
  });
}

// This script is a mirror of it's original counterpart used within the Auth0 platform. It is not used within this backend and only provided as context.
