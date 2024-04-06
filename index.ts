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
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: 'Email and password are required.' });
    }

    const user = await pool.query(`
      SELECT * FROM employees WHERE email = '${email}';
    `);

    if (user.rows.length === 0) {
      return res.status(400).json({ message: 'Incorrect email or password.' });
    }

    if (bcrypt.compareSync(password, user.rows[0].password)) {
      return res
        .status(200)
        .json({ message: 'Login successful.', user: user.rows[0] });
    } else {
      return res.status(400).json({ message: 'Incorrect email or password.' });
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
      return res.status(400).json({ message: 'Invalid activation code.' });
    }

    return res.status(200).json({ message: 'Valid activation code.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

app.post('/check-email', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const user = await pool.query(`
      SELECT * FROM employees WHERE email = '${email}';
    `);

    if (user.rows.length > 0) {
      return res
        .status(400)
        .json({ message: 'Account already exists on this email.' });
    }

    return res.status(200).json({ message: 'Email is available.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

app.post('/register', async (req, res) => {
  try {
    const { email, first_name, last_name, password, code } = req.body;

    if (!email || !first_name || !last_name || !password || !code) {
      return res.status(400).json({ message: 'Missing fields.' });
    }

    // Check activation code.
    const activationCode = await pool.query(`
      SELECT * FROM activation_codes WHERE code = '${code}' AND activated_by IS NULL;
    `);

    if (activationCode.rows.length === 0) {
      return res
        .status(400)
        .json({ message: 'Invalid activation code.', errorFrom: 'code' });
    }

    // Register user.
    const user = await pool.query(`
      SELECT * FROM employees WHERE email = '${email}'
    `);

    if (user.rows.length > 0) {
      return res
        .status(400)
        .json({ message: 'User already exists.', errorFrom: 'email' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const privilege = 'employee';

    const result = await pool.query(`
      INSERT INTO employees (email, first_name, last_name, password, privilege_type)
      VALUES ('${email}', '${first_name}', '${last_name}', '${hashedPassword}', '${privilege}')
      RETURNING *;
    `);

    // Consume activation code.
    const { id } = result.rows[0];

    await pool.query(`
      UPDATE activation_codes
      SET activated_by = '${id}', activated_at = NOW()
      WHERE code = '${code}';
    `);

    return res
      .status(200)
      .json({ message: 'User registered.', user: result.rows[0] });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

app.listen(port, () => {
  console.log('Server running on', port);
});
