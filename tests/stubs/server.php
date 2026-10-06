<?php

// Stubs for server and Files app classes that nextcloud/ocp references but does not ship.

namespace OC\Hooks {
	interface Emitter {
	}
}

namespace OC {
	class Image {
		public function loadFromData(string $str): \GdImage|false {
			return false;
		}

		public function valid(): bool {
			return false;
		}

		public function scaleDownToFit(int $maxWidth, int $maxHeight): bool {
			return false;
		}
	}
}

namespace OCA\Files\Event {
	use OCP\EventDispatcher\Event;

	class LoadAdditionalScriptsEvent extends Event {
	}
}
