# hack.claudeseattle.org

Teams, submissions, and judging for the Claude Impact Lab Hackathon. Spec: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md). Agent and ownership rules: [CLAUDE.md](CLAUDE.md).

## Local setup

```bash
git clone https://github.com/00Zero/claudeseattle-hack.git && cd claudeseattle-hack
npm install
cp .env.example .env.local   # fill in the values Adam gives you; never commit this file
npm run dev
open http://localhost:3000   # log in with a magic link
```
