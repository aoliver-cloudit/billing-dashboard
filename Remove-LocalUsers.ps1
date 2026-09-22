<#
.SYNOPSIS
    Removes the local user accounts created by New-LocalUsers.ps1.

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

foreach ($name in $UserNames) {
    if (Get-LocalUser -Name $name -ErrorAction SilentlyContinue) {
        Remove-LocalUser -Name $name
        Write-Host "Removed local user '$name'." -ForegroundColor Green
    }
    else {
        Write-Host "User '$name' does not exist - skipping." -ForegroundColor Yellow
    }
}
