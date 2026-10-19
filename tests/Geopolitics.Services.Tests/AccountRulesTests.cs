using Geopolitics.Services;

namespace Geopolitics.Services.Tests;

public class AccountRulesTests
{
    [Theory]
    [InlineData("abc")]
    [InlineData("Mpho_2027")]
    public void Valid_usernames_are_accepted(string username) =>
        Assert.Null(AccountRules.ValidateUsername(username));

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("ab")]
    [InlineData("has space")]
    [InlineData("bad-name")]
    [InlineData("semi;colon")]
    [InlineData("emoji\U0001F600")]
    public void Invalid_usernames_are_rejected(string username) =>
        Assert.NotNull(AccountRules.ValidateUsername(username));

    [Fact]
    public void Overlong_usernames_are_rejected() =>
        Assert.NotNull(AccountRules.ValidateUsername(new string('a', 21)));

    [Theory]
    [InlineData("abcdefg1")]
    [InlineData("Risk2027Game")]
    public void Valid_passwords_are_accepted(string password) =>
        Assert.Null(AccountRules.ValidatePassword(password));

    [Theory]
    [InlineData("")]
    [InlineData("short1")]
    [InlineData("allletters")]
    [InlineData("12345678")]
    public void Weak_passwords_are_rejected(string password) =>
        Assert.NotNull(AccountRules.ValidatePassword(password));

    [Fact]
    public void Overlong_passwords_are_rejected() =>
        Assert.NotNull(AccountRules.ValidatePassword(new string('a', 100) + "1"));

    [Fact]
    public void A_password_cannot_match_the_username() =>
        Assert.NotNull(AccountRules.ValidatePassword("Mpho2027", "mpho2027"));
}
