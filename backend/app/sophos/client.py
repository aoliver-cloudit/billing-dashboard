import time

import httpx

from app.config import Settings
from app.sophos.schemas import SophosDeployment

TOKEN_URL = "https://id.sophos.com/api/v2/oauth2/token"
WHOAMI_URL = "https://api.central.sophos.com/whoami/v1"
PARTNER_BASE = "https://api.central.sophos.com/partner/v1"
PAGE_SIZE = 100

_token_cache: dict[str, tuple[str, float]] = {}


class SophosAPIError(RuntimeError):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"Sophos API error ({status_code}): {detail}")


class SophosClient:
    def __init__(self, settings: Settings):
        self._client_id = settings.sophos_client_id
        self._client_secret = settings.sophos_client_secret

    async def _get_access_token(self, client: httpx.AsyncClient) -> str:
        cached = _token_cache.get(self._client_id)
        if cached and cached[1] > time.monotonic() + 30:
            return cached[0]

        response = await client.post(
            TOKEN_URL,
            data={
                "grant_type": "client_credentials",
                "client_id": self._client_id,
                "client_secret": self._client_secret,
                "scope": "token",
            },
        )
        if response.status_code != 200:
            raise SophosAPIError(response.status_code, response.text)

        payload = response.json()
        token = payload["access_token"]
        expires_in = payload.get("expires_in", 3600)
        _token_cache[self._client_id] = (token, time.monotonic() + expires_in)
        return token

    async def _get_partner_id(self, client: httpx.AsyncClient, headers: dict[str, str]) -> str:
        response = await client.get(WHOAMI_URL, headers=headers)
        if response.status_code != 200:
            raise SophosAPIError(response.status_code, response.text)
        return response.json()["id"]

    async def _get_all_tenants(
        self, client: httpx.AsyncClient, headers: dict[str, str]
    ) -> list[dict]:
        tenants: list[dict] = []
        page = 1

        while True:
            response = await client.get(
                f"{PARTNER_BASE}/tenants",
                params={"page": page, "pageSize": PAGE_SIZE},
                headers=headers,
            )
            if response.status_code != 200:
                raise SophosAPIError(response.status_code, response.text)

            items = response.json().get("items", [])
            tenants.extend(items)

            if len(items) < PAGE_SIZE:
                return tenants
            page += 1

    async def _find_tenant(
        self, client: httpx.AsyncClient, headers: dict[str, str], name: str
    ) -> dict | None:
        tenants = await self._get_all_tenants(client, headers)
        target = name.strip().lower()

        def names(tenant: dict) -> list[str]:
            return [
                (tenant.get("name") or "").strip().lower(),
                (tenant.get("showAs") or "").strip().lower(),
            ]

        for tenant in tenants:
            if target in names(tenant):
                return tenant
        for tenant in tenants:
            if any(target in n for n in names(tenant) if n):
                return tenant
        return None

    async def _get_endpoint_count(
        self, client: httpx.AsyncClient, token: str, tenant: dict
    ) -> int:
        response = await client.get(
            f"{tenant['apiHost']}/endpoint/v1/endpoints",
            params={"pageSize": 1, "pageTotal": "true"},
            headers={"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant["id"]},
        )
        if response.status_code != 200:
            raise SophosAPIError(response.status_code, response.text)

        return response.json().get("pages", {}).get("items", 0)

    async def _get_disk_encrypted_count(
        self, client: httpx.AsyncClient, token: str, tenant: dict
    ) -> int:
        # The `overallEncryptionStatus` query filter's documented enum doesn't
        # include every value Sophos actually reports (e.g. "unmanaged"), so it
        # silently matches nothing for tenants using those values. Count
        # client-side from the full endpoint list instead.
        headers = {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant["id"]}
        count = 0
        page_from_key: str | None = None

        while True:
            params: dict = {"pageSize": 500, "view": "full"}
            if page_from_key:
                params["pageFromKey"] = page_from_key

            response = await client.get(
                f"{tenant['apiHost']}/endpoint/v1/endpoints", params=params, headers=headers
            )
            if response.status_code != 200:
                raise SophosAPIError(response.status_code, response.text)

            payload = response.json()
            for item in payload.get("items", []):
                encryption = item.get("encryption") or {}
                if encryption.get("overallStatus") == "encrypted":
                    count += 1

            page_from_key = payload.get("pages", {}).get("nextKey")
            if not page_from_key:
                return count

    async def get_deployment(self, customer_name: str) -> SophosDeployment:
        async with httpx.AsyncClient(timeout=30.0) as client:
            token = await self._get_access_token(client)
            auth_header = {"Authorization": f"Bearer {token}"}

            partner_id = await self._get_partner_id(client, auth_header)
            partner_headers = {**auth_header, "X-Partner-ID": partner_id}

            tenant = await self._find_tenant(client, partner_headers, customer_name)
            if not tenant:
                return SophosDeployment(matched=False)

            device_count = await self._get_endpoint_count(client, token, tenant)
            encrypted_count = await self._get_disk_encrypted_count(client, token, tenant)

            return SophosDeployment(
                matched=True,
                tenant_id=tenant.get("id"),
                tenant_name=tenant.get("showAs") or tenant.get("name"),
                device_count=device_count,
                encrypted_count=encrypted_count,
            )
