# Setup Guide: Next.js Bingo Game Application

This guide provides step-by-step instructions to build a clean Next.js application for a Bingo game front-end.

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

---

## Step 1: Initialize the Project

**Terminal Command:**
```bash
npm install
```

**What this does:** Installs all dependencies including Next.js, React, TypeScript, Tailwind CSS, and their required packages.

**Files created/updated:**
- `package.json` - Project dependencies and scripts

---

## Step 2: Configure TypeScript

**File Path:** `tsconfig.json`

**Code:**
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

---

## Step 3: Configure Tailwind CSS

**File Path:** `tailwind.config.ts`

**Code:**
```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
export default config;
```

**File Path:** `postcss.config.mjs`

**Code:**
```javascript
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
```

**File Path:** `app/globals.css`

**Code:**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## Step 4: Configure Next.js

**File Path:** `next.config.mjs`

**Code:**
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
```

---

## Step 5: Set Up Environment Variables Template

**File Path:** `.env.local.example`

**Code:**
```
# Supabase Configuration
# Copy this file to .env.local and fill in your actual values
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

**Terminal Command (after creating the file):**
```bash
cp .env.local.example .env.local
```

**Note:** Fill in your actual Supabase credentials in `.env.local` when ready to connect.

---

## Step 6: Create Root Layout

**File Path:** `app/layout.tsx`

**Code:**
```typescript
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dingmoney Bingo",
  description: "Bingo game application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-gray-200 bg-white">
          <div className="container mx-auto px-4 py-4">
            <h1 className="text-2xl font-bold text-gray-900">Dingmoney Bingo</h1>
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
```

---

## Step 7: Create Home Page

**File Path:** `app/page.tsx`

**Code:**
```typescript
export default function Home() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <h2 className="text-3xl font-semibold text-gray-800 mb-4">
          Welcome to Dingmoney Bingo
        </h2>
        <p className="text-gray-600">
          Navigate to the auth page or lobby to get started.
        </p>
      </div>
    </div>
  );
}
```

---

## Step 8: Create Authentication Page

**File Path:** `app/(public)/auth/page.tsx`

**Code:**
```typescript
"use client";

import { useState } from "react";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement authentication logic with Supabase
    console.log("Form submitted:", { email, password, isSignUp });
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md space-y-8 rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">
            {isSignUp ? "Sign Up" : "Sign In"}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {isSignUp
              ? "Create a new account"
              : "Sign in to your account"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {isSignUp ? "Sign Up" : "Sign In"}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              {isSignUp
                ? "Already have an account? Sign in"
                : "Don't have an account? Sign up"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

---

## Step 9: Create Lobby Page

**File Path:** `app/(protected)/lobby/page.tsx`

**Code:**
```typescript
export default function LobbyPage() {
  // TODO: Fetch Bingo rooms from Supabase
  const rooms: Array<{ id: string; name: string; players: number }> = [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Bingo Lobby</h2>
        <p className="mt-2 text-gray-600">
          Join a room or create a new game
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        {rooms.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">
              No rooms available. Check back later or create a new room.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {rooms.map((room) => (
              <li
                key={room.id}
                className="flex items-center justify-between rounded-md border border-gray-200 p-4 hover:bg-gray-50"
              >
                <div>
                  <h3 className="font-medium text-gray-900">{room.name}</h3>
                  <p className="text-sm text-gray-500">
                    {room.players} player{room.players !== 1 ? "s" : ""}
                  </p>
                </div>
                <button className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
                  Join
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

---

## Step 10: Create Game Page

**File Path:** `app/(protected)/game/[roomId]/page.tsx`

**Code:**
```typescript
import BingoCard from "@/components/BingoCard";

interface GamePageProps {
  params: {
    roomId: string;
  };
}

export default function GamePage({ params }: GamePageProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">
          Bingo Game - Room {params.roomId}
        </h2>
        <p className="mt-2 text-gray-600">
          Mark your numbers as they are called
        </p>
      </div>

      <div className="flex justify-center">
        <BingoCard />
      </div>
    </div>
  );
}
```

---

## Step 11: Create Bingo Card Component

**File Path:** `components/BingoCard.tsx`

**Code:**
```typescript
"use client";

import { useState } from "react";

interface Cell {
  number: number;
  marked: boolean;
}

export default function BingoCard() {
  // Generate a 5x5 grid with random numbers (1-75 for standard Bingo)
  // Center cell is FREE
  const generateCard = (): Cell[][] => {
    const card: Cell[][] = [];
    const usedNumbers = new Set<number>();

    for (let row = 0; row < 5; row++) {
      const cardRow: Cell[] = [];
      for (let col = 0; col < 5; col++) {
        // Center cell is FREE
        if (row === 2 && col === 2) {
          cardRow.push({ number: 0, marked: true });
        } else {
          // Generate a unique number between 1-75
          let num: number;
          do {
            num = Math.floor(Math.random() * 75) + 1;
          } while (usedNumbers.has(num));
          usedNumbers.add(num);
          cardRow.push({ number: num, marked: false });
        }
      }
      card.push(cardRow);
    }

    return card;
  };

  const [card, setCard] = useState<Cell[][]>(generateCard);

  const toggleCell = (row: number, col: number) => {
    // Don't allow toggling the FREE cell
    if (row === 2 && col === 2) return;

    setCard((prevCard) => {
      const newCard = prevCard.map((r, rIdx) =>
        r.map((cell, cIdx) => {
          if (rIdx === row && cIdx === col) {
            return { ...cell, marked: !cell.marked };
          }
          return cell;
        })
      );
      return newCard;
    });
  };

  return (
    <div className="rounded-lg border-2 border-gray-800 bg-white p-4 shadow-lg">
      <div className="grid grid-cols-5 gap-2">
        {card.map((row, rowIdx) =>
          row.map((cell, colIdx) => (
            <button
              key={`${rowIdx}-${colIdx}`}
              onClick={() => toggleCell(rowIdx, colIdx)}
              disabled={rowIdx === 2 && colIdx === 2}
              className={`
                aspect-square rounded border-2 p-2 text-lg font-semibold transition-colors
                ${
                  rowIdx === 2 && colIdx === 2
                    ? "border-gray-400 bg-gray-200 text-gray-600 cursor-default"
                    : cell.marked
                    ? "border-blue-600 bg-blue-100 text-blue-900"
                    : "border-gray-300 bg-white text-gray-900 hover:bg-gray-50"
                }
              `}
            >
              {rowIdx === 2 && colIdx === 2 ? (
                <span className="text-xs">FREE</span>
              ) : (
                cell.number
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
```

---

## Step 12: Create Supabase Client Placeholder

**File Path:** `lib/supabaseClient.ts`

**Code:**
```typescript
// Placeholder for Supabase client initialization
// This will be implemented when Supabase is integrated

export function createSupabaseClient() {
  // TODO: Initialize Supabase client
  // Example structure:
  // import { createClient } from '@supabase/supabase-js'
  // 
  // const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  // const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  // 
  // if (!supabaseUrl || !supabaseAnonKey) {
  //   throw new Error('Missing Supabase environment variables')
  // }
  // 
  // return createClient(supabaseUrl, supabaseAnonKey)

  return null;
}

// Export a placeholder client getter
export function getSupabaseClient() {
  return createSupabaseClient();
}
```

---

## Step 13: Create .gitignore File

**File Path:** `.gitignore`

**Code:**
```
# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# dependencies
/node_modules
/.pnp
.pnp.js

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# local env files
.env*.local
.env

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
```

---

## Step 14: Run the Development Server

**Terminal Command:**
```bash
npm run dev
```

**What this does:** Starts the Next.js development server on `http://localhost:3000`

**Expected Result:** You should see the home page with a header and welcome message. You can navigate to:
- `/auth` - Authentication page
- `/lobby` - Lobby page
- `/game/[any-room-id]` - Game page with Bingo card

---

## Summary

All files have been created. The application structure is:

```
dingmoney/
├── app/
│   ├── (public)/
│   │   └── auth/
│   │       └── page.tsx
│   ├── (protected)/
│   │   ├── lobby/
│   │   │   └── page.tsx
│   │   └── game/
│   │       └── [roomId]/
│   │           └── page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   └── BingoCard.tsx
├── lib/
│   └── supabaseClient.ts
├── .env.local.example
├── .gitignore
├── next.config.mjs
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
└── tsconfig.json
```

## Next Steps

1. Install dependencies: `npm install`
2. Copy `.env.local.example` to `.env.local` and add your Supabase credentials when ready
3. Run `npm run dev` to start the development server
4. Implement Supabase authentication in the auth page
5. Connect the lobby page to fetch rooms from Supabase
6. Add real-time game functionality using Supabase Realtime

---

## Notes

- The route groups `(public)` and `(protected)` are Next.js conventions that don't affect the URL structure but help organize routes
- The Bingo card generates random numbers on each page load (this will be replaced with server-generated cards later)
- All authentication and data fetching logic is marked with `TODO` comments for future implementation

