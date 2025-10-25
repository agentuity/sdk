export interface FooBar {
	bar: string;
}

export const foo: FooBar = {
	bar: 'hi',
};

export async function generateFoo(): Promise<FooBar> {
	return foo;
}
