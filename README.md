# KIVO

### Apna hisaab, ekdum clear.

**A personal lending and repayment tracker built to make everyday money management simpler, clearer, and more reliable.**

> 🚧 **Project Status: Under Active Development**
>
> KIVO is currently being built. Features, database integration, testing, and documentation are being developed and refined as the project progresses.

---

## About KIVO

Keeping track of money lent to friends and family can quickly become confusing. KIVO aims to solve this by bringing lending records, repayments, and outstanding balances into one organized place.

Designed with simplicity and clarity in mind, KIVO focuses on helping users understand who owes them money, how much has been repaid, and what remains outstanding.

## Planned Features

- **People Management** — Keep lending records organized by person.
- **Lending Records** — Record money lent with relevant transaction details.
- **Repayment Tracking** — Track partial and full repayments.
- **Outstanding Balances** — Keep track of remaining amounts.
- **Activity History** — Review past transactions and repayments.
- **Financial Reports** — View summaries and export records.
- **Secure Accounts** — Keep each user's financial records private.

*Features are planned and may change as development progresses.*

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL |
| ORM | Prisma |
| Testing | Vitest, browser-based E2E tests |
| Infrastructure | Docker Compose |

## Design Philosophy

KIVO follows a **Midnight & Mint** design direction, combining forest green, mint, and off-white with a clean, minimal interface.

The goal is simple: make financial information easy to understand without unnecessary visual clutter.

## Project Structure

```text
kivo-personal-finance/
├── e2e/          # End-to-end tests
├── server/       # Backend and database
├── web/          # Frontend application
├── docs/         # Project documentation
├── docker-compose.yml
├── package.json
└── README.md
```

*The structure will evolve as development continues.*

## Getting Started

Local installation and setup instructions will be added once the development configuration is finalized and verified.

## Development Roadmap

- [ ] Complete project and database setup
- [ ] Implement authentication and session management
- [ ] Build lending and repayment workflows
- [ ] Connect the frontend to the backend
- [ ] Verify financial calculations and data isolation
- [ ] Complete automated and end-to-end testing
- [ ] Document setup and deployment

## Security

- Never commit real credentials, API secrets, or production environment files.
- Configure environment variables locally using the provided example template.
- Protect financial records through authentication and user-level access controls.

## License

No license has been specified yet.

---

**KIVO is a work in progress.** The goal is to build a practical, maintainable, and reliable personal finance tool, one feature at a time.