export class ScientISSTException extends Error {
	constructor(message: string) {
		super(message)
	}
}

export class ConnectionInProgressException extends ScientISSTException {
	constructor() {
		super("Connection with the device is already in progress")
	}
}

export class NotImplementedException extends ScientISSTException {
	constructor() {
		super("Not implemented")
	}
}

export class NotSupportedException extends ScientISSTException {
	constructor() {
		super(
			"This communication mode is not supported in this browser or platform"
		)
	}
}

export class UserCancelledException extends ScientISSTException {
	constructor() {
		super("User cancelled the action")
	}
}

export class ConnectionFailedException extends ScientISSTException {
	constructor() {
		super("Failed to connect to the device")
	}
}

export class NotConnectedException extends ScientISSTException {
	constructor() {
		super("Device is not connected")
	}
}

export class ConnectionLostException extends ScientISSTException {
	constructor() {
		super("Lost connection with device")
	}
}

export class AlreadyConnectedException extends ScientISSTException {
	constructor() {
		super("Device is already connected")
	}
}

export class IdleException extends ScientISSTException {
	constructor() {
		super("This action cannot be performed in idle state")
	}
}

export class NotIdleException extends ScientISSTException {
	constructor() {
		super("This action can only be performed in idle state")
	}
}

export class NoChannelsEnabledException extends ScientISSTException {
	constructor() {
		super("No channels are enabled")
	}
}

export class InvalidSamplingRateException extends ScientISSTException {
	constructor() {
		super("Invalid sampling rate")
	}
}
