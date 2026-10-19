using System.Text.RegularExpressions;

namespace Geopolitics.Services;

// Rules for usernames and passwords. Each method returns an error message,
// or null when the value is acceptable.
public static class AccountRules
{
    public const int MinUsernameLength = 3;
    public const int MaxUsernameLength = 20;
    public const int MinPasswordLength = 8;
    public const int MaxPasswordLength = 100;

    private static readonly Regex UsernamePattern = new(@"^[A-Za-z0-9_]+\z", RegexOptions.Compiled);

    public static string? ValidateUsername(string? username)
    {
        if (string.IsNullOrWhiteSpace(username))
            return "Choose a username.";

        username = username.Trim();
        if (username.Length < MinUsernameLength || username.Length > MaxUsernameLength)
            return $"Username must be {MinUsernameLength} to {MaxUsernameLength} characters.";
        if (!UsernamePattern.IsMatch(username))
            return "Username can only use letters, numbers and underscores.";

        return null;
    }

    public static string? ValidatePassword(string? password, string? username = null)
    {
        if (string.IsNullOrEmpty(password))
            return "Choose a password.";
        if (password.Length < MinPasswordLength || password.Length > MaxPasswordLength)
            return $"Password must be {MinPasswordLength} to {MaxPasswordLength} characters.";
        if (!password.Any(char.IsLetter) || !password.Any(char.IsDigit))
            return "Password must contain at least one letter and one number.";
        if (username != null && password.Equals(username.Trim(), StringComparison.OrdinalIgnoreCase))
            return "Password must be different from your username.";

        return null;
    }
}
