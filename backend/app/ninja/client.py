import time

import httpx

from app.config import Settings
from app.ninja.schemas import NinjaDeployment, NinjaOnboardResult

PAGE_SIZE = 1000
VALID_APPROVAL_MODES = {"AUTOMATIC", "MANUAL", "REJECT"}

_token_cache: dict[tuple[str, str], tuple[str, float]] = {}


class NinjaAPIError(RuntimeError):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"NinjaRMM API error ({status_code}): {detail}")


class NinjaAlreadyExistsError(RuntimeError):
    def __init__(self, organization_name: str):
        self.organization_name = organization_name
        super().__init__(f"NinjaRMM organization already exists: {organization_name}")


class NinjaClient:
    def __init__(self, settings: Settings):
        self._base_url = settings.ninja_base_url.rstrip("/")
        self._client_id = settings.ninja_client_id
        self._client_secret = settings.ninja_client_secret
        self._template_organization_id = settings.ninja_template_organization_id
        self._node_approval_mode = settings.ninja_node_approval_mode.strip().upper()

    async def _get_access_token(self, client: httpx.AsyncClient, scope: str = "monitoring") -> str:
        cache_key = (self._client_id, scope)
        cached = _token_cache.get(cache_key)
        if cached and cached[1] > time.monotonic() + 30:
            return cached[0]

        response = await client.post(
            "/ws/oauth/token",
            data={
                "grant_type": "client_credentials",
                "client_id": self._client_id,
                "client_secret": self._client_secret,
                "scope": scope,
            },
        )
        if response.status_code != 200:
            raise NinjaAPIError(response.status_code, response.text)

        payload = response.json()
        token = payload["access_token"]
        expires_in = payload.get("expires_in", 3600)
        _token_cache[cache_key] = (token, time.monotonic() + expires_in)
        return token

    async def _get_paginated(
        self, client: httpx.AsyncClient, path: str, headers: dict[str, str]
    ) -> list[dict]:
        items: list[dict] = []
        after: int | None = None

        while True:
            params = {"pageSize": PAGE_SIZE}
            if after is not None:
                params["after"] = after

            response = await client.get(path, params=params, headers=headers)
            if response.status_code != 200:
                raise NinjaAPIError(response.status_code, response.text)

            batch = response.json()
            if not batch:
                break

            items.extend(batch)
            if len(batch) < PAGE_SIZE:
                break
            after = batch[-1]["id"]

        return items

    async def _find_organization(
        self, client: httpx.AsyncClient, headers: dict[str, str], name: str
    ) -> dict | None:
        organizations = await self._get_paginated(client, "/v2/organizations", headers)
        target = name.strip().lower()

        for org in organizations:
            if (org.get("name") or "").strip().lower() == target:
                return org
        for org in organizations:
            if target in (org.get("name") or "").strip().lower():
                return org
        return None

    async def onboard(self, customer_name: str) -> NinjaOnboardResult:
        name = customer_name.strip()
        if self._node_approval_mode not in VALID_APPROVAL_MODES:
            raise NinjaAPIError(
                500,
                f"NINJA_NODE_APPROVAL_MODE must be one of {sorted(VALID_APPROVAL_MODES)}",
            )

        async with httpx.AsyncClient(base_url=self._base_url, timeout=30.0) as client:
            token = await self._get_access_token(client)
            headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

            # Same lookup the card uses, so a stale card can't create a duplicate.
            existing = await self._find_organization(client, headers, name)
            if existing:
                raise NinjaAlreadyExistsError(existing.get("name") or name)

            # Creating needs the management scope, which the Client App must allow.
            token = await self._get_access_token(client, "monitoring management")
            headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

            params = {}
            if self._template_organization_id is not None:
                params["templateOrganizationId"] = self._template_organization_id

            response = await client.post(
                "/v2/organizations",
                params=params,
                headers=headers,
                json={"name": name, "nodeApprovalMode": self._node_approval_mode},
            )
            if response.status_code not in (200, 201):
                raise NinjaAPIError(response.status_code, response.text)

            organization = response.json()
            return NinjaOnboardResult(
                created=True,
                organization_id=organization.get("id"),
                organization_name=organization.get("name"),
            )

    async def get_deployment(self, customer_name: str) -> NinjaDeployment:
        async with httpx.AsyncClient(base_url=self._base_url, timeout=30.0) as client:
            token = await self._get_access_token(client)
            headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

            organization = await self._find_organization(client, headers, customer_name)
            if not organization:
                return NinjaDeployment(matched=False)

            org_id = organization["id"]
            devices = await self._get_paginated(
                client, f"/v2/organization/{org_id}/devices", headers
            )

            return NinjaDeployment(
                matched=True,
                organization_id=org_id,
                organization_name=organization.get("name"),
                device_count=len(devices),
            )
