export const sleep = async(ms: number): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, ms))
