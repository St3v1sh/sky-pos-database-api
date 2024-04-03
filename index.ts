import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import pool from './db';
import bcrypt from 'bcrypt';
import 'dotenv/config';

const app = express();
const port = process.env.PORT;

// Check API key.
function checkApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || Array.isArray(apiKey) || apiKey !== process.env.DB_API_KEY) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }
  next();
}

// Set up middleware.
app.use(checkApiKey);
app.use(bodyParser.json());

// Check credentials with database.
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: 'Username and password are required.' });
    }

    const user = await pool.query(`
      SELECT * FROM employees WHERE username = '${username}';
    `);

    if (user.rows.length === 0) {
      return res
        .status(401)
        .json({ message: 'Incorrect username or password.' });
    }

    if (bcrypt.compareSync(password, user.rows[0].password)) {
      return res.status(200).json({ message: 'Login successful.' });
    } else {
      return res
        .status(401)
        .json({ message: 'Incorrect username or password.' });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

app.post('/check-activation-code', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'Activation code is required.' });
    }

    const activationCode = await pool.query(`
      SELECT * FROM activation_codes WHERE code = '${code}' AND activated_by IS NULL;
    `);

    if (activationCode.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid activation code.' });
    }

    return res.status(200).json({ message: 'Valid activation code.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

app.post('/register', async (req, res) => {
  try {
    const { username, password, code } = req.body;

    if (!username || !password || !code) {
      return res.status(400).json({ message: 'Missing fields.' });
    }

    // Check activation code.
    const activationCode = await pool.query(`
      SELECT * FROM activation_codes WHERE code = '${code}' AND activated_by IS NULL;
    `);

    if (activationCode.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid activation code.' });
    }

    // Register user.
    const user = await pool.query(`
      SELECT * FROM employees WHERE username = '${username}'
    `);

    if (user.rows.length > 0) {
      return res.status(400).json({ message: 'User already exists.' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const privilege = 'employee';

    const result = await pool.query(`
      INSERT INTO employees (username, password, privilege_type)
      VALUES ('${username}', '${hashedPassword}', '${privilege}')
      RETURNING id;
    `);

    // Consume activation code.
    const { id } = result.rows[0];

    await pool.query(`
      UPDATE activation_codes
      SET activated_by = '${id}', activated_at = NOW()
      WHERE code = '${code}';
    `);

    return res.status(200).json({ message: 'User registered.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

app.listen(port, () => {
  console.log('Server running on', port);
});
