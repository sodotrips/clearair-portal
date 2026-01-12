import CredentialsProvider from 'next-auth/providers/credentials';
import { google } from 'googleapis';
import path from 'path';
import bcrypt from 'bcryptjs';
import type { NextAuthOptions } from 'next-auth';

const SPREADSHEET_ID = '1sWJpsvt8aNnmwTssfQ3GWvxa8-RVUy2M7eLHM5YSN3k';

async function getUsers() {
  // Use environment variable in production, file in development
  let auth;
  try {
    if (process.env.GOOGLE_CREDENTIALS) {
      console.log('Using GOOGLE_CREDENTIALS env var');
      const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
      console.log('Parsed credentials, client_email:', credentials.client_email);
      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    } else {
      console.log('Using local credentials file');
      const credentialsPath = path.join(process.cwd(), 'google-credentials.json');
      auth = new google.auth.GoogleAuth({
        keyFile: credentialsPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    }
  } catch (parseError) {
    console.error('Error parsing GOOGLE_CREDENTIALS:', parseError);
    return [];
  }

  const sheets = google.sheets({ version: 'v4', auth });

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Users!A:E',
    });

    const rows = response.data.values || [];
    console.log('Found', rows.length, 'rows in Users sheet');
    if (rows.length < 2) return [];

    const headers = rows[0];
    return rows.slice(1).map(row => {
      const user: Record<string, string> = {};
      headers.forEach((header: string, i: number) => {
        user[header] = row[i] || '';
      });
      return user;
    });
  } catch (error) {
    console.error('Error fetching users from sheet:', error);
    return [];
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const users = await getUsers();
        const user = users.find(
          u => u['Username']?.toLowerCase() === credentials.username.toLowerCase()
        );

        if (!user) {
          return null;
        }

        // Check password - support both hashed and plain text (for initial setup)
        const passwordMatch = user['Password'].startsWith('$2')
          ? await bcrypt.compare(credentials.password, user['Password'])
          : credentials.password === user['Password'];

        if (!passwordMatch) {
          return null;
        }

        return {
          id: user['Username'],
          name: user['Name'],
          email: user['Username'],
          role: user['Role'],
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET || 'clearair-secret-key-change-in-production',
};
