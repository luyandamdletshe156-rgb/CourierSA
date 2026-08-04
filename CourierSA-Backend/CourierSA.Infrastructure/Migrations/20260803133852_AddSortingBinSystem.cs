using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CourierSA.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSortingBinSystem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Zone",
                table: "Parcels",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PostalCodeZoneRules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "char(36)", nullable: false, collation: "ascii_general_ci"),
                    PostalCodeFrom = table.Column<int>(type: "int", nullable: false),
                    PostalCodeTo = table.Column<int>(type: "int", nullable: false),
                    Zone = table.Column<int>(type: "int", nullable: false),
                    Description = table.Column<string>(type: "longtext", nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    IsDeleted = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "datetime(6)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PostalCodeZoneRules", x => x.Id);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "SortingBins",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "char(36)", nullable: false, collation: "ascii_general_ci"),
                    BinCode = table.Column<string>(type: "longtext", nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Zone = table.Column<int>(type: "int", nullable: false),
                    Capacity = table.Column<int>(type: "int", nullable: false),
                    CurrentCount = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    IsDeleted = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "datetime(6)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SortingBins", x => x.Id);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "ParcelSortingAssignments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "char(36)", nullable: false, collation: "ascii_general_ci"),
                    ParcelId = table.Column<Guid>(type: "char(36)", nullable: false, collation: "ascii_general_ci"),
                    SuggestedBinId = table.Column<Guid>(type: "char(36)", nullable: true, collation: "ascii_general_ci"),
                    ConfirmedBinId = table.Column<Guid>(type: "char(36)", nullable: true, collation: "ascii_general_ci"),
                    ConfirmedAt = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    ConfirmedByStaffId = table.Column<Guid>(type: "char(36)", nullable: true, collation: "ascii_general_ci"),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    IsDeleted = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "datetime(6)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ParcelSortingAssignments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ParcelSortingAssignments_Parcels_ParcelId",
                        column: x => x.ParcelId,
                        principalTable: "Parcels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ParcelSortingAssignments_SortingBins_ConfirmedBinId",
                        column: x => x.ConfirmedBinId,
                        principalTable: "SortingBins",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ParcelSortingAssignments_SortingBins_SuggestedBinId",
                        column: x => x.SuggestedBinId,
                        principalTable: "SortingBins",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_ParcelSortingAssignments_ConfirmedBinId",
                table: "ParcelSortingAssignments",
                column: "ConfirmedBinId");

            migrationBuilder.CreateIndex(
                name: "IX_ParcelSortingAssignments_ParcelId",
                table: "ParcelSortingAssignments",
                column: "ParcelId");

            migrationBuilder.CreateIndex(
                name: "IX_ParcelSortingAssignments_SuggestedBinId",
                table: "ParcelSortingAssignments",
                column: "SuggestedBinId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ParcelSortingAssignments");

            migrationBuilder.DropTable(
                name: "PostalCodeZoneRules");

            migrationBuilder.DropTable(
                name: "SortingBins");

            migrationBuilder.DropColumn(
                name: "Zone",
                table: "Parcels");
        }
    }
}
