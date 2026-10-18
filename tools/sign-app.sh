#!/bin/sh
# Writes appinfo/signature.json into an app folder, using the occ of the compose Nextcloud.
#   tools/sign-app.sh <app folder> <private key> <certificate>
# The folder must be named like the app id. Key and certificate are copied into the container for the
# duration of the command and removed again; the folder is signed there and signature.json copied back.
set -eu

app=$1
key=$2
crt=$3
name=$(basename "$app")
container=${NEXTCLOUD_CONTAINER:-keepass-extension-nextcloud-1}
work=/tmp/keenext-sign

trap 'docker exec -u root "$container" rm -rf "$work"' EXIT

docker exec -u root "$container" sh -c "rm -rf $work && mkdir -p $work"
docker cp "$app" "$container:$work/"
docker cp "$key" "$container:$work/signing.key"
docker cp "$crt" "$container:$work/signing.crt"
docker exec -u root "$container" chown -R www-data:www-data "$work"
docker exec -u www-data "$container" php occ integrity:sign-app \
	--privateKey="$work/signing.key" --certificate="$work/signing.crt" --path="$work/$name"
docker cp "$container:$work/$name/appinfo/signature.json" "$app/appinfo/signature.json"
