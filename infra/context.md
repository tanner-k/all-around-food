# infra/

## Scope
- Infrastructure-as-code (Terraform, CloudFormation)
- Deploy scripts (`scripts/deploy.sh`, systemd units)
- EC2 / cloud configuration
- Secrets management policy (where they live, who has access)
- Personal Mac Mini worker supervision templates in `worker/`

## Not in scope
- GitHub Actions workflows → `.github/workflows/` (at repo root)
- Application code → `frontend/` `backend/`
- Database schema → `data/`

## Stack
Vercel

The personal import worker runs as a macOS LaunchAgent from the backend's
native Python 3.12 virtualenv. `worker/install-macos-worker.sh` preflights a
specific checkout and generates a resolved plist with private logs; it never
loads the agent. The Mac-only `.env` holds service-role and Anthropic secrets,
while Vercel receives no worker secrets. The worker makes outbound connections
only. It cannot run before FileVault unlock and user login, and does not change
sleep or power settings.

## Local skills / conventions
- None yet — add as needed

## Conventions
- Never commit secrets — use GitHub Actions secrets + SSM Parameter Store
- All Terraform state in remote backend (S3 + DynamoDB lock), never local
- One module per concern (`vpc/`, `ec2/`, `rds/`, `dns/`)
- Tag every cloud resource with `Project=all-around-food`

## Notes for agents
- Run `terraform plan` and paste the output in the PR before applying
- Destructive changes (RDS, VPC) require a second reviewer
- The deploy SSH key lives only in GitHub Actions secrets (`EC2_SSH_KEY`)
