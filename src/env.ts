/** Parse a process env flag. Empty/missing values use `defaultValue`. */
export function envFlagTrue(name: string, defaultValue = false): boolean {
    const raw = process.env[name];
    if (raw == null || raw === '') return defaultValue;
    switch (raw.trim().toLowerCase()) {
        case '1':
        case 'true':
        case 'yes':
        case 'on':
            return true;
        case '0':
        case 'false':
        case 'no':
        case 'off':
            return false;
        default:
            return defaultValue;
    }
}
