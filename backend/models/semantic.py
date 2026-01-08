"""Pydantic models for semantic layer generation."""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum


class ColumnType(str, Enum):
    """Type of column in semantic layer."""
    DIMENSION = "dimension"
    MEASURE = "measure"
    TIME = "time"


class SemanticColumn(BaseModel):
    """A column definition in the semantic layer."""
    name: str = Field(..., description="Column name")
    source_column: str = Field(..., description="Original BigQuery column name")
    type: ColumnType = Field(..., description="Semantic type")
    data_type: str = Field(..., description="Data type (STRING, INT64, etc.)")
    description: Optional[str] = Field(None, description="Human-readable description")
    aggregation: Optional[str] = Field(None, description="Default aggregation for measures (SUM, AVG, COUNT)")


class SemanticTable(BaseModel):
    """A table definition in the semantic layer."""
    name: str = Field(..., description="Semantic table name")
    source_table: str = Field(..., description="Full BigQuery table reference (dataset.table)")
    description: Optional[str] = Field(None, description="Human-readable description")
    columns: List[SemanticColumn] = Field(default_factory=list, description="Column definitions")


class SemanticModel(BaseModel):
    """Complete semantic layer model."""
    id: Optional[str] = Field(None, description="Model ID")
    name: str = Field(..., description="Model name")
    description: Optional[str] = Field(None, description="Model description")
    tables: List[SemanticTable] = Field(default_factory=list, description="Tables in the model")
    relationships: List[Dict[str, str]] = Field(default_factory=list, description="Foreign key relationships")
    created_at: Optional[str] = Field(None, description="Creation timestamp")


class GenerateRequest(BaseModel):
    """Request to generate semantic layer."""
    tables: List[str] = Field(..., description="List of fully qualified table names (dataset.table)")


class StreamEvent(BaseModel):
    """SSE stream event payload."""
    type: str = Field(..., description="Event type: 'text', 'status', 'done', 'error'")
    content: Optional[str] = Field(None, description="Text content")
    data: Optional[Dict[str, Any]] = Field(None, description="Additional data")


class RelationshipType(str, Enum):
    """Type of relationship between tables."""
    ONE_TO_ONE = "one-to-one"
    ONE_TO_MANY = "one-to-many"
    MANY_TO_ONE = "many-to-one"
    MANY_TO_MANY = "many-to-many"


class ConfidenceLevel(str, Enum):
    """Confidence level for detected relationships."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class DetectedRelationship(BaseModel):
    """A relationship detected by the LLM agent."""
    from_table: str = Field(..., description="Source table (dataset.table)")
    from_column: str = Field(..., description="Source column name")
    to_table: str = Field(..., description="Target table (dataset.table)")
    to_column: str = Field(..., description="Target column name")
    relationship_type: str = Field(..., description="one-to-one, one-to-many, many-to-one, many-to-many")
    confidence: str = Field(..., description="high, medium, or low")
    reasoning: str = Field(..., description="LLM's explanation for why this relationship exists")


class RelationshipRequest(BaseModel):
    """Request to detect relationships in a semantic model."""
    tables: List[Dict[str, Any]] = Field(..., description="List of table schemas with columns")

