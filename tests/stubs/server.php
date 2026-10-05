<?php

// Stubs for server and Files app classes that nextcloud/ocp references but does not ship.

namespace OC\Hooks {
	interface Emitter {
	}
}

namespace OCA\Files\Event {
	use OCP\EventDispatcher\Event;

	class LoadAdditionalScriptsEvent extends Event {
	}
}
