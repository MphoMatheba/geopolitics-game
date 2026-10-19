using Geopolitics.Data.Models;
using Geopolitics.Data.Repositories;
using Geopolitics.Services;
using Microsoft.AspNetCore.Identity;

namespace Geopolitics.Web.Security;

// Registration and login. Passwords are never stored: only a salted, slow
// PBKDF2 hash made by ASP.NET Core's PasswordHasher.
public class AccountService(IUserRepository users)
{
    private static readonly PasswordHasher<UserDoc> Hasher = new();
    private static readonly UserDoc DummyUser = new();
    private static readonly string DummyHash = Hasher.HashPassword(DummyUser, Guid.NewGuid().ToString("N"));

    public async Task<(UserDoc? User, string? Error)> RegisterAsync(string username, string password)
    {
        var error = AccountRules.ValidateUsername(username) ?? AccountRules.ValidatePassword(password, username);
        if (error != null)
            return (null, error);

        var user = new UserDoc { Username = username.Trim() };
        user.PasswordHash = Hasher.HashPassword(user, password);

        if (!await users.CreateAsync(user))
            return (null, "That username is already taken.");

        return (user, null);
    }

    // Returns the user when the credentials are right, otherwise null. The same
    // amount of work is done whether or not the username exists, so response
    // time does not reveal which usernames are registered.
    public async Task<UserDoc?> ValidateLoginAsync(string? username, string? password)
    {
        var user = await users.FindByUsernameAsync(username ?? "");
        if (user == null)
        {
            Hasher.VerifyHashedPassword(DummyUser, DummyHash, password ?? "");
            return null;
        }

        var result = Hasher.VerifyHashedPassword(user, user.PasswordHash, password ?? "");
        return result == PasswordVerificationResult.Failed ? null : user;
    }
}
