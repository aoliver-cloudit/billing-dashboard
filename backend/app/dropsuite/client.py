import httpx

from app.config import Settings
from app.dropsuite.schemas import DropsuiteDeployment

PER_PAGE = 100


class DropsuiteAPIError(RuntimeError):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"Dropsuite API error ({status_code}): {detail}")


class DropsuiteClient:
    def __init__(self, settings: Settings):
        self._base_url = settings.dropsuite_base_url.rstrip("/")
        self._headers = {
            "X-Reseller-Token": settings.dropsuite_reseller_token,
            "X-Access-Token": settings.dropsuite_access_token,
            "Accept": "application/json",
        }

    async def _get(self, client: httpx.AsyncClient, path: str, params: dict):
        response = await client.get(path, params=params)
        if response.status_code != 200:
            raise DropsuiteAPIError(response.status_code, response.text)
        return response.json()

    async def _consume_shard(
        self, client: httpx.AsyncClient, shard: dict, users: list[dict]
    ) -> None:
        # The API groups results into "shards" (e.g. by account type), each with
        # its own {pagination, result_set} and independent next_link cursor.
        while True:
            users.extend(shard.get("result_set") or [])
            next_link = (shard.get("pagination") or {}).get("next_link")
            if not next_link:
                return
            payload = await self._get(client, next_link, {})
            shard = payload if isinstance(payload, dict) else {}

    async def _get_all_users(self, client: httpx.AsyncClient) -> list[dict]:
        users: list[dict] = []
        payload = await self._get(client, "/users", {"page": 1, "per_page": PER_PAGE})
        shards = payload if isinstance(payload, list) else [payload]

        for shard in shards:
            if isinstance(shard, dict):
                await self._consume_shard(client, shard, users)

        return users

    async def _find_organization(self, client: httpx.AsyncClient, name: str) -> dict | None:
        users = await self._get_all_users(client)
        target = name.strip().lower()

        def org_name(user: dict) -> str:
            return (user.get("organization_name") or "").strip().lower()

        for user in users:
            if org_name(user) == target:
                return user
        for user in users:
            if target in org_name(user):
                return user
        return None

    async def get_deployment(self, customer_name: str) -> DropsuiteDeployment:
        async with httpx.AsyncClient(
            base_url=self._base_url, headers=self._headers, timeout=30.0
        ) as client:
            org = await self._find_organization(client, customer_name)
            if not org:
                return DropsuiteDeployment(matched=False)

            detail = await self._get(client, f"/users/{org['id']}", {})

            return DropsuiteDeployment(
                matched=True,
                organization_id=org.get("id"),
                organization_name=org.get("organization_name"),
                seats_used=detail.get("seats_used"),
            )
