# Google Cloud deployment

The organiser announcement supplied with this task says the judging submission must be available on Google Cloud. The existing Sites preview is not evidence that this requirement is met.

This Node application is prepared for Cloud Run source deployment: it binds to `0.0.0.0`, honours `PORT`, and starts with `npm start`. Google buildpacks build the deployment image; no Dockerfile or local Docker installation is needed.

## Deploy from Google Cloud Shell

Use your team's authorised project with its hackathon credits/billing configured. Replace YOUR_PROJECT_ID below. Confirm with your project administrator that Cloud Run source deployment permissions and the build service account's Cloud Run Builder role are configured, as described in the official guide.

```sh
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
# From the repository root:
gcloud run deploy margin-commuter --source . --region asia-southeast1 --allow-unauthenticated --min-instances 0 --max-instances 2
```

The command returns an HTTPS service URL. Public access is intentional so judges can open the app. If your organisation forbids public access, arrange an approved judging access method with your administrator. Run the command from the updated source, not from dist alone.

The upload excludes `.env`, `.git` and local app metadata using `.gcloudignore`. Without an LTA key the public app remains a labelled demo and reports the live feed as unavailable.

## Live provider secrets

Create secrets in Google Secret Manager for `LTA_DATAMALL_ACCOUNT_KEY`, `ONEMAP_API_TOKEN` and `OPENROUTESERVICE_API_KEY`. Grant the Cloud Run runtime service identity Secret Manager Secret Accessor and expose each secret to the service under the matching environment-variable name. Never paste a key into source files, a public terminal transcript, browser code or the README.

OneMap handles address search. Walking routing tries OneMap and falls back to openrouteservice. LTA supplies alerts and current/forecast station crowding. Gemini is not used.

## Verify before submitting

1. Open the returned URL on a phone and check `/api/health` returns `{"status":"ok"}`.
2. Try Tampines to Raffles Place, 07:40 departure, 08:45 deadline.
3. Check the normal, minor-delay and major-disruption replays.
4. Expand assistance demos; confirm bus boarding and shuttle availability are distinct and labelled demo.
5. Check official alerts. Without credentials it must say unavailable. With credentials verify the timestamp and compare against official notices.
6. Add the verified Cloud Run URL and demo recording link to README.md. Do not replace placeholders with untested claims.

Status: source prepared and locally tested; **not deployed or cloud-verified in this task**. The local environment has no gcloud command or supplied project ID.

References: [Cloud Run source deployments](https://docs.cloud.google.com/run/docs/deploying-source-code), [Node.js quickstart](https://docs.cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-nodejs-service).
