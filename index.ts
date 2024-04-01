import express from 'express';
import bodyParser from 'body-parser';
import pool from './db';
import bcrypt from 'bcrypt';
import 'dotenv/config';

const app = express();
const port = process.env.PORT;

// Check API key.
function checkApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.DB_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  next();
}

app.use(checkApiKey);
app.use(bodyParser.json());

// Check credentials with database.
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: 'Username and password are required.' });
    }

    const user = await pool.query(`
      SELECT * FROM employees WHERE username = '${username}'
    `);

    if (user.rows.length === 0) {
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }

    if (bcrypt.compareSync(password, user.rows[0].password)) {
      return res.status(200).json({ message: 'Login successful.' });
    } else {
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

app.listen(port, () => {
  console.log('Server running on', port);
});
