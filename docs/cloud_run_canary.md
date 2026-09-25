# Private Cloud Run canary

The manual **Ship** workflow deploys a private Cloud Run canary from the release
tag. It also deploys the public GitHub Pages example, then waits for approval
before publishing the packed npm candidate.
The canary requires Google authentication; public traffic cannot invoke it.

The container serves the compiled example and its custom progress API. Every
example build polls [PublicNode](https://solana.publicnode.com/) directly from
the browser every two seconds for live Solana counts. The public static build
sets `VITE_ENABLE_BACKEND=false` and has no Node API. Development and canary
builds enable the backend for custom HTTP/SSE progress.

## QA

Sign in with a Google account that can invoke the Cloud Run service. Set the
service, project, and region in your local shell, then run:

```sh
gcloud run services proxy "$GCP_CANARY_SERVICE" \
  --project="$GCP_PROJECT_ID" --region="$GCP_CANARY_REGION" --port=8080
```

Open http://127.0.0.1:8080. Check the live Solana rate after two samples and
try the demo and custom-progress controls. The service URL shown by Ship
returns an authorization error to unauthenticated browsers. The local proxy
authenticates requests with your Google credentials.

The deployment uses scale-to-zero, a service and revision maximum of one
instance, 1 CPU, 512 MiB memory, and ten concurrent requests. These settings
limit compute exposure but do not impose a hard spending limit, including on
network egress or build artifacts. An alerts-only billing budget does not cap
spending. For stronger cost control, create a separate **spend cap enforcement**
budget for your project and service **Cloud Run** in
[Cloud Billing](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps).
Spend cap enforcement can lag usage, so leave a margin below your actual limit.

## Release identity

Ship uses keyless GitHub OIDC. Its provider should accept only this repository's
`main` ref and `.github/workflows/ship.yml`. Set the repository secrets
`GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT`,
`GCP_PROJECT_ID`, `GCP_CANARY_REGION`, `GCP_CANARY_SERVICE`,
`GCP_RUNTIME_SERVICE_ACCOUNT`, and `GCP_BUILD_SERVICE_ACCOUNT` before shipping.
The deploy identity needs source deployment permission and access to the
dedicated build and runtime identities; it should manage IAM only on the canary
service. The runtime identity needs no project roles. No Google service account
key is stored in GitHub.
