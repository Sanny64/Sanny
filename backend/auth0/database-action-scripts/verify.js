function verify(email, callback) {
  const mysql = require("mysql");
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
      [email.trim().toLowerCase()],
      function (err, results) {
        connection.end();
        if (err) return callback(err);
        callback(null, results.length > 0);
      },
    );
  });
}

// This script is a mirror of it's original counterpart used within the Auth0 platform. It is not used within this backend and only provided as context.
