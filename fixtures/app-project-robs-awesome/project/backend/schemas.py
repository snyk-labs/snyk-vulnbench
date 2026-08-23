from pydantic import BaseModel, Field


class ReportRead(BaseModel):
    """A report returned from the search API."""

    id: int = Field(description="Report identifier.")
    title: str = Field(description="Report title.")
    content: str = Field(description="Report body content.")
