app_name := keenext
build_dir := build
package := $(build_dir)/$(app_name)

.PHONY: build appstore clean

build:
	npm ci
	npm run build
	npm run l10n

# Tarball for the App Store or a manual install into custom_apps/.
appstore: clean build
	rm -rf $(package) $(package).tar.gz
	mkdir -p $(package)
	cp -r appinfo css img js l10n lib templates $(package)/
	cp LICENSE README.md $(package)/
	find $(package)/js -name '*.map' -delete
	tar -czf $(package).tar.gz -C $(build_dir) $(app_name)

clean:
	rm -rf $(build_dir) js css
