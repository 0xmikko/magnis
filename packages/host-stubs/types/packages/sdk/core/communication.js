/** Provider message identity is local to the connected account and domain. */
export function communicationMessageExternalId(schemaId, accountId, remoteId) {
    if (accountId.length === 0 || remoteId.length === 0)
        throw new Error("Communication message requires an account and provider ID");
    return `${schemaId}:${JSON.stringify(accountId)}:${JSON.stringify(remoteId)}`;
}
