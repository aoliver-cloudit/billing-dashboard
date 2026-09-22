<#
.SYNOPSIS
    Creates local, non-administrator user accounts on this machine.

.DESCRIPTION
    Creates each user in $UserNames as a local account (member of the
    built-in "Users" group only), generates a random temporary password
    for each, forces a password change at next logon, and writes the
    generated credentials to a CSV file for hand-off.

.NOTES
    Must be run from an elevated (Administrator) PowerShell session.
#>

#Requires -RunAsAdministrator

$UserNames = @(
    'derek.eads',
    'rick.elliott',
    'adam.ott',
    'taylor.thodiyil',
    'william.supinger',
    'jason.crossett',
    'anthony.denier',
    'hunter.eads'
)

$ScriptDirectory = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$OutputCsv = Join-Path -Path $ScriptDirectory -ChildPath 'NewLocalUsers-Credentials.csv'

function New-RandomPassword {
    param([int]$Length = 16)

    $upper   = [char[]]'ABCDEFGHJKLMNPQRSTUVWXYZ'
    $lower   = [char[]]'abcdefghijkmnopqrstuvwxyz'
    $digits  = [char[]]'23456789'
    $special = [char[]]'!@#$%^&*-_=+'
    $all     = $upper + $lower + $digits + $special

    # Guarantee at least one character from each set, then fill the rest randomly.
    $passwordChars = @(
        $upper[(Get-Random -Maximum $upper.Length)]
        $lower[(Get-Random -Maximum $lower.Length)]
        $digits[(Get-Random -Maximum $digits.Length)]
        $special[(Get-Random -Maximum $special.Length)]
    )

    for ($i = $passwordChars.Count; $i -lt $Length; $i++) {
        $passwordChars += $all[(Get-Random -Maximum $all.Length)]
    }

    # Shuffle so the guaranteed characters aren't always in the first four slots.
    $shuffled = $passwordChars | Sort-Object { Get-Random }
    -join $shuffled
}

$results = foreach ($name in $UserNames) {

    if (Get-LocalUser -Name $name -ErrorAction SilentlyContinue) {
        Write-Warning "User '$name' already exists - skipping."
        continue
    }

    $plainPassword = New-RandomPassword
    $securePassword = ConvertTo-SecureString -String $plainPassword -AsPlainText -Force

    try {
        New-LocalUser -Name $name `
            -Password $securePassword `
            -FullName $name `
            -Description 'Created by New-LocalUsers.ps1' `
            -AccountNeverExpires `
            -PasswordNeverExpires:$false `
            -ErrorAction Stop | Out-Null

        # New-LocalUser adds accounts to "Users" by default and NOT to
        # "Administrators". Explicitly confirm membership and make sure
        # the account is not in Administrators just in case a prior
        # partial run added it there.
        Add-LocalGroupMember -Group 'Users' -Member $name -ErrorAction SilentlyContinue

        $isAdmin = (Get-LocalGroupMember -Group 'Administrators' -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -like "*\$name" }) -ne $null

        if ($isAdmin) {
            Remove-LocalGroupMember -Group 'Administrators' -Member $name -ErrorAction SilentlyContinue
        }

        # Force the user to set their own password on first logon instead
        # of leaving the generated one in place indefinitely.
        Set-LocalUser -Name $name -PasswordNeverExpires $false
        $null = & net.exe user $name /logonpasswordchg:yes

        Write-Host "Created local user '$name' (non-admin)." -ForegroundColor Green

        [PSCustomObject]@{
            UserName = $name
            Password = $plainPassword
            Status   = 'Created'
        }
    }
    catch {
        Write-Warning "Failed to create user '$name': $($_.Exception.Message)"
        [PSCustomObject]@{
            UserName = $name
            Password = ''
            Status   = "Failed: $($_.Exception.Message)"
        }
    }
}

if ($results) {
    $results | Export-Csv -Path $OutputCsv -NoTypeInformation
    Write-Host "`nCredentials written to $OutputCsv" -ForegroundColor Cyan
    Write-Host "Distribute these securely and delete the CSV afterward." -ForegroundColor Yellow
}
