function getUser(identifierValue, callback) {
  const mysql = require("mysql");
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
      "SELECT id, name, email FROM User WHERE email = ? LIMIT 1",
      [email],
      function (err, results) {
        connection.end();
        if (err || results.length === 0) return callback(err || null);
        const user = results[0];
        callback(null, {
          user_id: String(user.id),
          username: user.name,
          email: user.email,
        });
      },
    );
  });
}

// This script is a mirror of it's original counterpart used within the Auth0 platform. It is not used within this backend and only provided as context.
