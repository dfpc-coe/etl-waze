<h1 align='center'>ETL-Waze</h1>

<p align='center'>Waze for Cities partner feed (alerts, jams &amp; unusual traffic) for CloudTAK</p>

## Overview

Polls a [Waze for Cities](https://www.waze.com/wazeforcities) partner feed and posts one of its collections to the map.
Each Layer ingests a single collection selected by `WAZE_TYPE`, and the Layer's output schema reflects that collection -
create one Layer per collection to ingest all three:

| Feed Collection  | Geometry   | CoT Type | Notes                                                                    |
| ---------------- | ---------- | -------- | ------------------------------------------------------------------------ |
| `alerts`         | Point      | `a-f-G`  | User reports - accidents, hazards, road closures, jams, weather, police  |
| `jams`           | LineString | `u-d-f`  | Traffic jams, colored by level (0 free flow to 5 blocked)                |
| `irregularities` | LineString | `u-d-f`  | Unusual traffic, dashed and colored by jam level                         |

The feed URL is built from the Partner ID and Feed Token that Waze provides in the Partner Hub:

```
https://www.waze.com/partnerhub-api/partners/<WAZE_PARTNER_ID>/waze-feeds/<WAZE_TOKEN>?format=1
```

## Environment

| Variable              | Required | Default                                | Description                                                     |
| --------------------- | -------- | -------------------------------------- | --------------------------------------------------------------- |
| `WAZE_PARTNER_ID`     | Yes      |                                        | Numeric Partner ID from the feed URL                            |
| `WAZE_TOKEN`          | Yes      |                                        | Feed Token (UUID) from the feed URL                             |
| `WAZE_API_URL`        | No       | `https://www.waze.com/partnerhub-api`  | Partner Hub API base URL                                        |
| `WAZE_TYPE`           | No       | `alerts`                               | Collection to ingest - `alerts`, `jams` or `irregularities`     |
| `Minimum Reliability` | No       | `0`                                    | Alerts only - drop Alerts with a reliability below this (0-10)  |
| `DEBUG`               | No       | `false`                                | Print results in logs                                           |

## Development

DFPC provided Lambda ETLs are currently all written in [NodeJS](https://nodejs.org/en) through the use of a AWS Lambda optimized
Docker container. Documentation for the Dockerfile can be found in the [AWS Help Center](https://docs.aws.amazon.com/lambda/latest/dg/images-create.html)

```sh
npm install
```

Add a .env file in the root directory that gives the ETL script the necessary variables to communicate with a local ETL server.
When the ETL is deployed the `ETL_API` and `ETL_LAYER` variables will be provided by the Lambda Environment

```json
{
    "ETL_API": "http://localhost:5001",
    "ETL_LAYER": "19"
}
```

To run the task, ensure the local [CloudTAK](https://github.com/dfpc-coe/CloudTAK/) server is running and then run with typescript runtime
or build to JS and run natively with node

```
ts-node task.ts
```

```
npm run build
cp .env dist/
node dist/task.js
```

### Deployment

Deployment into the CloudTAK environment for configuration is done via automatic releases to the DFPC AWS environment.

Github actions will build and push docker releases on every version tag which can then be automatically configured via the
CloudTAK API.

Builds are performed by the `cloudtak-etl` script provided by [`@tak-ps/etl`](https://github.com/dfpc-coe/etl-base).
It requires a `capabilities.json` document alongside the `Dockerfile` which describes the task (name, description,
compute requirements, permissions & invocation types) and is validated and embedded in the OCI Image Manifest as a
`com.cloudtak.capabilities` annotation so CloudTAK can read it directly from ECR before the task is ever deployed.
Update `capabilities.json` whenever the task's requirements change.

To build & push manually:

```sh
export AWS_REGION='us-east-1'
export AWS_ACCOUNT_ID='123456789012'
export Environment='prod' # Optional - defaults to prod

npx cloudtak-etl
```

Non-DFPC users will need to setup their own docker => ECS build system via something like Github Actions or AWS Codebuild.
