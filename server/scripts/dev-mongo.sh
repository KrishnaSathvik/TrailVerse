#!/usr/bin/env bash
# Local development MongoDB — single-node REPLICA SET (not standalone).
#
# The evidence store writes inside session.withTransaction; a standalone
# mongod rejects that (MongoServerError 20) and the whole evidence stack then
# fails quietly (see tests/support/transactionalMongo.js). So dev Mongo must
# be a replica set, even with one node.
#
# Idempotent: safe to run repeatedly. Point server/.env at:
#   MONGODB_URI=mongodb://localhost:27017/trailverse-dev?replicaSet=rs0&directConnection=true
set -euo pipefail

NAME=trailverse-dev-mongo
VOLUME=trailverse-dev-mongo-data
IMAGE=mongo:7

if ! docker info >/dev/null 2>&1; then
  echo "🛑 Docker is not running. Start Docker Desktop first." >&2
  exit 1
fi

if [ -z "$(docker ps -q -f name=^${NAME}$)" ]; then
  if [ -n "$(docker ps -aq -f name=^${NAME}$)" ]; then
    echo "▶ Starting existing container ${NAME}…"
    docker start "${NAME}" >/dev/null
  else
    echo "▶ Creating ${NAME} (single-node replica set rs0)…"
    docker run -d \
      --name "${NAME}" \
      -p 27017:27017 \
      -v "${VOLUME}:/data/db" \
      "${IMAGE}" --replSet rs0 --bind_ip_all >/dev/null
  fi
else
  echo "✓ ${NAME} already running."
fi

echo "▶ Waiting for mongod…"
for _ in $(seq 1 30); do
  if docker exec "${NAME}" mongosh --quiet --eval "db.runCommand({ping:1}).ok" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

STATE=$(docker exec "${NAME}" mongosh --quiet --eval "try { rs.status().myState } catch (e) { 0 }" 2>/dev/null || echo 0)
if [ "${STATE}" != "1" ]; then
  echo "▶ Initiating replica set rs0…"
  docker exec "${NAME}" mongosh --quiet --eval \
    "try { rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]}).ok } catch (e) { if (!/already initialized/.test(e.message)) throw e; 1 }" >/dev/null
  for _ in $(seq 1 30); do
    STATE=$(docker exec "${NAME}" mongosh --quiet --eval "try { rs.status().myState } catch (e) { 0 }" 2>/dev/null || echo 0)
    [ "${STATE}" = "1" ] && break
    sleep 1
  done
fi

if [ "${STATE}" = "1" ]; then
  echo "✅ Dev Mongo ready (replica set PRIMARY) at mongodb://localhost:27017/?replicaSet=rs0"
  echo "   Transactions supported. Suggested MONGODB_URI:"
  echo "   mongodb://localhost:27017/trailverse-dev?replicaSet=rs0&directConnection=true"
else
  echo "🛑 Replica set did not reach PRIMARY. Inspect: docker logs ${NAME}" >&2
  exit 1
fi
