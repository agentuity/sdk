export class ServiceException extends Error {
	statusCode: number;
	url: string;
	constructor(message: string, url: string, statusCode: number) {
		super(message);
		this.url = url;
		this.statusCode = statusCode;
	}
}
