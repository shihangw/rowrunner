# Private Cloud Run canary

The private deployment repository runs the manual **Deploy Canary** workflow.
It checks out an existing release tag from the public Rowrunner repository and
deploys a Cloud Run canary. After QA, run **Ship** in the public repository with
the same tag to deploy GitHub Pages and request npm release approval. Cloud Run
requires Google authentication; public traffic cannot invoke the canary.

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
try the demo and custom-progress controls. The canary URL returns an
authorization error to unauthenticated browsers. The local proxy authenticates
requests with your Google credentials.

The deployment uses scale-to-zero, a service and revision maximum of one
instance, 1 CPU, 512 MiB memory, and ten concurrent requests. These settings
limit compute exposure but do not impose a hard spending limit, including on
network egress or build artifacts. An alerts-only billing budget does not cap
spending. For stronger cost control, create a separate **spend cap enforcement**
budget for your project and service **Cloud Run** in
[Cloud Billing](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps).
Spend cap enforcement can lag usage, so leave a margin below your actual limit.

## Release identity

The private deployment workflow uses keyless GitHub OIDC and keeps its project
configuration and logs in a private repository. Its provider accepts only that
repository's `main` ref and canary workflow. The public Ship workflow does not
receive GCP deployment secrets or emit the private service URL. The runtime
identity needs no project roles; no Google service account key is stored in
GitHub.
