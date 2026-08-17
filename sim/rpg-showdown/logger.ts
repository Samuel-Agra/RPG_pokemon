export type RPGLogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

export interface RPGLoggerOptions {
	level?: RPGLogLevel;
	sink?: (...values: unknown[]) => void;
}

const LOG_PRIORITY: Readonly<Record<RPGLogLevel, number>> = {
	silent: 0,
	error: 1,
	warn: 2,
	info: 3,
	debug: 4,
};

export class RPGLogger {
	static level: RPGLogLevel = 'silent';
	static sink: (...values: unknown[]) => void = () => {};

	/** Compatibilidade com a antiga chave booleana. */
	static get enabled(): boolean {
		return this.level === 'debug';
	}

	static set enabled(value: boolean) {
		this.level = value ? 'debug' : 'silent';
	}

	static configure(options: RPGLoggerOptions = {}): void {
		if (options.level !== undefined) this.level = options.level;
		if (options.sink !== undefined) this.sink = options.sink;
	}

	static reset(): void {
		this.level = 'silent';
		this.sink = () => {};
	}

	static debug(...values: unknown[]): void {
		this.write('debug', values);
	}

	static info(...values: unknown[]): void {
		this.write('info', values);
	}

	static warn(...values: unknown[]): void {
		this.write('warn', values);
	}

	static error(...values: unknown[]): void {
		this.write('error', values);
	}

	private static write(level: Exclude<RPGLogLevel, 'silent'>, values: unknown[]): void {
		if (LOG_PRIORITY[this.level] < LOG_PRIORITY[level]) return;
		this.sink('[RPG]', `[${level.toUpperCase()}]`, ...values);
	}
}
