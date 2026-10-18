# KIVO — Personal Finance Tracker

**Apna hisaab, ekdum clear.**

KIVO is a personal lending and repayment tracker designed to help users manage money lent to others, track repayments, and keep their financial records organized in one place.

## Overview

KIVO aims to make everyday money tracking simple, clear, and reliable. It focuses on recording transactions, monitoring outstanding balances, and maintaining a consistent history of lending and repayments.

## Planned Features

- Manage people and their lending records
- Record money lent and repayments received
- Track outstanding balances
- View transaction activity and financial summaries
- Generate reports and export financial records
- Secure authentication and user-specific data
- Maintain transaction history after logout and login

## Tech Stack

The project source is organized around the following technologies:

- **Frontend:** React, TypeScript, Vite
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Testing:** Vitest and browser-based end-to-end tests
- **Infrastructure:** Docker Compose

## Design

KIVO uses a **Midnight & Mint** visual theme, combining forest green, mint, and off-white colors for a clean, minimal interface.

The interface is designed around clarity, readable financial information, and simple navigation.

## Project Structure

```text
kivo-personal-finance/
├── e2e/
├── server/
│   ├── prisma/
│   └── src/
├── web/
│   └── src/
├── docs/
├── docker-compose.yml
├── package.json
└── README.md
```

## Development Status

KIVO is currently under development. Features, configuration, testing, and setup instructions will be updated as implementation progresses.

## Getting Started

Local setup instructions will be added after the project configuration, dependencies, and database migrations have been verified.

## Security

- Never commit real environment files, credentials, or API secrets.
- Use `.env.example` as a template for required environment variables.
- Keep personal financial records private and protected.

## License

No license has been specified yet. All rights reserved unless a license is added to this repository.

---

Built with care as a full-stack personal finance project.