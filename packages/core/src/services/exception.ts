export class ServiceException extends Error {
	statusCode: number;
	method: string;
	url: string;
	constructor(message: string, method: string, url: string, statusCode: number) {
		super(message);
		this.method = method;
		this.url = url;
		this.statusCode = statusCode;
	}
}
