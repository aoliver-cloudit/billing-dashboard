import base64
import time

import httpx

from app.config import Settings
from app.connectsecure.schemas import ConnectSecureDeployment

PAGE_SIZE = 200
TOKEN_TTL_SECONDS = 300

_token_cache: dict[str, tuple[str, str, float]] = {}


class ConnectSecureAPIError(RuntimeError):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"ConnectSecure API error ({status_code}): {detail}")


class ConnectSecureClient:
    def __init__(self, settings: Settings):
        self._base_url = settings.connectsecure_base_url.rstrip("/")
        self._cache_key = f"{settings.connectsecure_tenant}:{settings.connectsecure_client_id}"

        auth_string = f"{settings.connectsecure_tenant}+{settings.connectsecure_client_id}:{settings.connectsecure_client_secret}"
        self._client_auth_token = base64.b64encode(auth_string.encode()).decode()

    async def _authorize(self, client: httpx.AsyncClient) -> tuple[str, str]:
        cached = _token_cache.get(self._cache_key)
        if cached and cached[2] > time.monotonic():
            return cached[0], cached[1]

        response = await client.post(
            "/w/authorize", headers={"Client-Auth-Token": self._client_auth_token}
        )
        if response.status_code != 200:
            raise ConnectSecureAPIError(response.status_code, response.text)

        payload = response.json()
        if not isinstance(payload, dict) or "data" not in payload:
            raise ConnectSecureAPIError(response.status_code, response.text)

        data = payload["data"]
        access_token, user_id = data["access_token"], data["user_id"]
        _token_cache[self._cache_key] = (access_token, user_id, time.monotonic() + TOKEN_TTL_SECONDS)
        return access_token, user_id

    async def _get(
        self, client: httpx.AsyncClient, path: str, headers: dict[str, str], params: dict
    ) -> dict:
        response = await client.get(path, headers=headers, params=params)

        if response.status_code == 401:
            _token_cache.pop(self._cache_key, None)
            access_token, user_id = await self._authorize(client)
            headers = {**headers, "Authorization": f"Bearer {access_token}", "X-USER-ID": user_id}
            response = await client.get(path, headers=headers, params=params)

        if response.status_code != 200:
            raise ConnectSecureAPIError(response.status_code, response.text)
        return response.json()

    async def _get_all_companies(
        self, client: httpx.AsyncClient, headers: dict[str, str]
    ) -> list[dict]:
        companies: list[dict] = []
        skip = 0

        while True:
            payload = await self._get(
                client,
                "/r/company/companies",
                headers,
                params={"skip": skip, "limit": PAGE_SIZE},
            )
            batch = payload.get("data") or []
            companies.extend(batch)

            if len(batch) < PAGE_SIZE:
                return companies
            skip += PAGE_SIZE

    async def _find_company(
        self, client: httpx.AsyncClient, headers: dict[str, str], name: str
    ) -> dict | None:
        companies = await self._get_all_companies(client, headers)
        target = name.strip().lower()

        def names(company: dict) -> list[str]:
            return [
                (company.get("name") or "").strip().lower(),
                (company.get("customer_name") or "").strip().lower(),
            ]

        for company in companies:
            if target in names(company):
                return company
        for company in companies:
            if any(target in n for n in names(company) if n):
                return company
        return None

    async def _get_asset_count(
        self, client: httpx.AsyncClient, headers: dict[str, str], company_id: int
    ) -> int:
        payload = await self._get(
            client,
            "/r/company/company_stats",
            headers,
            params={"condition": f"company_id={company_id}", "limit": 1},
        )
        stats = payload.get("data") or []
        if not stats:
            return 0
        return stats[0].get("total_assets", 0)

    async def get_deployment(self, customer_name: str) -> ConnectSecureDeployment:
        async with httpx.AsyncClient(base_url=self._base_url, timeout=30.0) as client:
            access_token, user_id = await self._authorize(client)
            headers = {"Authorization": f"Bearer {access_token}", "X-USER-ID": user_id}

            company = await self._find_company(client, headers, customer_name)
            if not company:
                return ConnectSecureDeployment(matched=False)

            device_count = await self._get_asset_count(client, headers, company["id"])

            return ConnectSecureDeployment(
                matched=True,
                company_id=company.get("id"),
                company_name=company.get("name"),
                device_count=device_count,
            )
