app_name := keenext
build_dir := build
package := $(build_dir)/$(app_name)

.PHONY: build package appstore release signing-inputs clean

build:
	npm ci
	npm run build
	npm run l10n

# The app folder as it is shipped: build/keenext/. Starts from a clean js/ and css/, which the build does not empty.
package: clean build
	mkdir -p $(package)
	cp -r appinfo css img js l10n lib templates $(package)/
	cp CHANGELOG.md LICENSE README.md $(package)/
	find $(package)/js -name '*.map' -delete

# Unsigned tarball, for a manual install into custom_apps/.
appstore: package
	tar -czf $(package).tar.gz -C $(build_dir) $(app_name)

# Tarball for the App Store, signed with the app certificate:
#   make release KEY=~/.nextcloud/certificates/keenext.key CRT=~/.nextcloud/certificates/keenext.crt
# Needs the compose Nextcloud (docker compose up -d) for its occ. build/keenext.tar.gz.sig holds the signature
# of the archive that the release form of the App Store asks for.
release: signing-inputs package
	tools/sign-app.sh $(package) "$(KEY)" "$(CRT)"
	tar -czf $(package).tar.gz -C $(build_dir) $(app_name)
	openssl dgst -sha512 -sign "$(KEY)" $(package).tar.gz | openssl base64 > $(package).tar.gz.sig
	@echo "$(package).tar.gz and $(package).tar.gz.sig written"

signing-inputs:
	@test -n "$(KEY)" -a -n "$(CRT)" || { echo "usage: make release KEY=<private key> CRT=<certificate>"; exit 1; }

clean:
	rm -rf $(build_dir) js css
