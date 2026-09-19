// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Monad Sperm Race — qualification et ownership
/// @notice La chaîne ne sert qu'à qualifier et à posséder : le gameplay n'y touche jamais.
///
/// Un contrat ne peut pas lire le nonce d'une adresse (aucun opcode NONCE(addr)).
/// Le serveur lit donc `eth_getTransactionCount`, signe une attestation EIP-712, et ce
/// contrat vérifie la signature dans `claimTicket()`. Aucun indexeur n'est nécessaire.
///
/// Règles Monad respectées :
/// - aucune fonction `payable` (reserve balance) ;
/// - un seul struct `Player` par adresse, pas de mappings parallèles (pages MIP-8) ;
/// - tout ce que le front relit passe par des events, jamais par un état ancien ;
/// - aucune boucle.
contract SpermRace {
    // ─── EIP-712 ────────────────────────────────────────────────────────────
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant ATTESTATION_TYPEHASH =
        keccak256("Attestation(address player,uint256 txCount,uint256 deadline)");
    bytes32 private constant NAME_HASH = keccak256("SpermRace");
    bytes32 private constant VERSION_HASH = keccak256("1");

    /// Moitié de l'ordre de secp256k1 : au-delà, `s` est malléable (EIP-2).
    uint256 private constant HALF_N = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    // ─── État ───────────────────────────────────────────────────────────────
    address public owner;
    address public attestor; // clé serveur qui signe les attestations
    uint256 public threshold; // nombre de tx exigé pour se qualifier

    struct Player {
        uint32 tickets;
        uint32 racesJoined;
        uint64 lastAttestation; // dernier txCount consommé : anti-rejeu
    }

    mapping(address => Player) public players;

    /// Seed publiée pour chaque course terminée. Non nulle = résultat figé, non réécrivable.
    mapping(uint256 => bytes32) public raceSeeds;

    // ─── Events ─────────────────────────────────────────────────────────────
    event TicketClaimed(address indexed player, uint256 txCount);
    event RaceJoined(address indexed player, uint256 indexed raceId);
    event RaceFinished(uint256 indexed raceId, bytes32 seed, address[3] podium);
    event ThresholdChanged(uint256 threshold);
    event AttestorChanged(address attestor);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ─── Erreurs ────────────────────────────────────────────────────────────
    error NotOwner();
    error ZeroAddress();
    error AttestationExpired();
    error BelowThreshold(uint256 txCount, uint256 threshold);
    error StaleAttestation(uint256 txCount, uint256 lastAttestation);
    error BadSignature();
    error NoTicket();
    error ResultAlreadySubmitted(uint256 raceId);
    error ZeroSeed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address attestor_, uint256 threshold_) {
        if (attestor_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        attestor = attestor_;
        threshold = threshold_;
        emit OwnershipTransferred(address(0), msg.sender);
        emit AttestorChanged(attestor_);
        emit ThresholdChanged(threshold_);
    }

    // ─── Joueur ─────────────────────────────────────────────────────────────

    /// @notice Échange une attestation serveur contre un ticket de course.
    /// @param txCount nonce de l'appelant lu par le serveur au moment de la signature
    /// @param deadline horodatage au-delà duquel l'attestation ne vaut plus rien
    /// @param sig signature EIP-712 de l'attestor sur (msg.sender, txCount, deadline)
    function claimTicket(uint256 txCount, uint256 deadline, bytes calldata sig) external {
        if (block.timestamp > deadline) revert AttestationExpired();
        if (txCount < threshold) revert BelowThreshold(txCount, threshold);

        Player storage p = players[msg.sender];
        // Anti-rejeu : chaque attestation doit porter un compteur strictement supérieur au
        // précédent. Réclamer un ticket consomme une tx, donc le compteur suivant est
        // toujours plus grand : le joueur peut rejouer, une signature ne sert qu'une fois.
        if (txCount <= p.lastAttestation) revert StaleAttestation(txCount, p.lastAttestation);

        bytes32 structHash = keccak256(abi.encode(ATTESTATION_TYPEHASH, msg.sender, txCount, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
        if (_recover(digest, sig) != attestor) revert BadSignature();

        p.lastAttestation = uint64(txCount); // un nonce ne dépasse jamais 2^64 (EIP-2681)
        p.tickets += 1;
        emit TicketClaimed(msg.sender, txCount);
    }

    /// @notice Brûle un ticket pour entrer dans une course. Le serveur relit l'event
    ///         `RaceJoined` dans le reçu avant d'admettre le joueur dans le lobby.
    function joinRace(uint256 raceId) external {
        Player storage p = players[msg.sender];
        if (p.tickets == 0) revert NoTicket();
        unchecked {
            p.tickets -= 1; // vérifié non nul juste au-dessus
        }
        p.racesJoined += 1;
        emit RaceJoined(msg.sender, raceId);
    }

    // ─── Owner ──────────────────────────────────────────────────────────────

    /// @notice Publie la seed et le podium d'une course. Une seule fois par course :
    ///         le classement publié ne peut plus être réécrit. address(0) = bot.
    function submitResult(uint256 raceId, bytes32 seed, address[3] calldata podium) external onlyOwner {
        if (seed == bytes32(0)) revert ZeroSeed();
        if (raceSeeds[raceId] != bytes32(0)) revert ResultAlreadySubmitted(raceId);
        raceSeeds[raceId] = seed;
        emit RaceFinished(raceId, seed, podium);
    }

    function setThreshold(uint256 threshold_) external onlyOwner {
        threshold = threshold_;
        emit ThresholdChanged(threshold_);
    }

    function setAttestor(address attestor_) external onlyOwner {
        if (attestor_ == address(0)) revert ZeroAddress();
        attestor = attestor_;
        emit AttestorChanged(attestor_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ─── EIP-712 ────────────────────────────────────────────────────────────

    /// Recalculé à chaque appel : reste juste si le testnet est rejoué sous un autre chainId.
    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address signer) {
        if (sig.length != 65) revert BadSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (uint256(s) > HALF_N) revert BadSignature();
        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert BadSignature();
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert BadSignature();
    }
}
