/** External Showdown accounts are not used by Pokémon RPG. */

type LoginServerResponse = [AnyObject, null] | [null, Error];

class TimeoutError extends Error {}

const disabledResponse = (): LoginServerResponse => [
	null,
	new Error('Showdown login server is not available in Pokémon RPG'),
];

const disabledServer = {
	disabled: true,
	request: () => Promise.resolve(disabledResponse()),
	instantRequest: () => Promise.resolve(disabledResponse()),
	getLog: () => 'disabled for Pokémon RPG',
};

export const LoginServer: any = Object.assign(disabledServer, {
	TimeoutError,
	ladderupdateServer: disabledServer,
	prepreplayServer: disabledServer,
});
