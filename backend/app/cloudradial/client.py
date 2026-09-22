import httpx

from app.cloudradial.schemas import CloudRadialDeployment
from app.config import Settings

PAGE_SIZE = 200


class CloudRadialAPIError(RuntimeError):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"CloudRadial API error ({status_code}): {detail}")


def _extract_list(data: dict | list | None) -> list:
    if data is None:
        return []
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("value") or []
    return []


class CloudRadialClient:
    def __init__(self, settings: Settings):
        self._base_url = settings.cloudradial_base_url.rstrip("/")
        self._auth = httpx.BasicAuth(settings.cloudradial_public_key, settings.cloudradial_private_key)

    async def _get_all_companies(self, client: httpx.AsyncClient) -> list[dict]:
        companies: list[dict] = []
        skip = 0

        while True:
            response = await client.get(
                "/v2/odata/company", params={"$top": PAGE_SIZE, "$skip": skip}
            )
            if response.status_code != 200:
                raise CloudRadialAPIError(response.status_code, response.text)

            batch = _extract_list(response.json())
            if not batch:
                break

            companies.extend(batch)
            if len(batch) < PAGE_SIZE:
                break
            skip += PAGE_SIZE

        return companies

    async def _find_company(self, client: httpx.AsyncClient, name: str) -> dict | None:
        companies = await self._get_all_companies(client)
        target = name.strip().lower()

        for company in companies:
            if (company.get("name") or "").strip().lower() == target:
                return company
        for company in companies:
            if target in (company.get("name") or "").strip().lower():
                return company
        return None

    async def get_deployment(self, customer_name: str) -> CloudRadialDeployment:
        async with httpx.AsyncClient(
            base_url=self._base_url, auth=self._auth, timeout=30.0
        ) as client:
            company = await self._find_company(client, customer_name)
            if not company:
                return CloudRadialDeployment(matched=False)

            return CloudRadialDeployment(
                matched=True,
                company_id=company.get("companyId"),
                company_name=company.get("name"),
                device_count=company.get("endpointCount"),
            )
