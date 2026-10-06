#!/bin/sh
# Runs once after the first installation inside the container (as www-data).
set -e
php /var/www/html/occ app:enable keenext
php /var/www/html/occ config:system:set debug --type=boolean --value=true
php /var/www/html/occ app:disable firstrunwizard || true
php /var/www/html/occ user:setting admin core lang en
mkdir -p /var/www/html/data/admin/files/KeePass
cp /fixtures/*.kdbx /fixtures/*.keyx /var/www/html/data/admin/files/KeePass/
php /var/www/html/occ files:scan admin
