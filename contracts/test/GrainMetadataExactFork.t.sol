// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;
import {GrainMetadataDexFactory} from '../src/mainnet/trial/GrainMetadataDexFactory.sol';
import {GrainMetadataToken} from '../src/mainnet/trial/GrainMetadataToken.sol';
import {GrainMainnetDexLocker} from '../src/mainnet/v3/GrainMainnetDexLocker.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
interface DexVm {function createSelectFork(string calldata) external returns(uint256);function envOr(string calldata,string calldata) external view returns(string memory);function skip(bool) external;function deal(address,uint256) external;function prank(address)external;}
interface DexNpm {function ownerOf(uint256)external view returns(address);function positions(uint256)external view returns(uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128);}
contract GrainMetadataExactForkTest {
 DexVm constant vm=DexVm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
 address constant WETH=0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
 address constant ROUTER=address(bytes20(hex'caf681a66d020601342297493863e78c959e5cb2'));
 GrainMetadataDexFactory private planningFactory;
 function req(uint256 salt,uint256 minOut)internal returns(GrainMetadataDexFactory.LaunchRequest memory){
  // A separate constructor instance creates the exact canonical document; the request binds the tested factory.
  GrainMetadataToken.Display memory d=GrainMetadataToken.Display('https://grainpad.fun/brand/grainpad-logo-symbol-core.svg','Exact production factory fork test',GrainMetadataToken.Socials('','','','https://grainpad.fun',''));
  bytes32 id=bytes32((uint256(uint160(address(this)))<<96)|salt);
  GrainMetadataToken preview=new GrainMetadataToken('Continuous','CONT',address(planningFactory),1_000_000_000 ether,address(this),id,d);
  return GrainMetadataDexFactory.LaunchRequest('Continuous','CONT',id,preview.contractURI(),preview.metadataHash(),uint64(block.timestamp+86400),minOut,block.timestamp+600,d);
 }

 function fork()internal returns(bool){string memory u=vm.envOr('RH_FORK_RPC',string(''));if(bytes(u).length==0){vm.skip(true);return false;}vm.createSelectFork(u);vm.deal(address(this),100 ether);return true;}
 function buy(address token,uint256 value)internal returns(uint256){(bool ok,bytes memory r)=ROUTER.call{value:value}(abi.encodeWithSignature('exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))',WETH,token,uint24(10000),address(this),value,uint256(1),uint160(0)));require(ok,'router buy');return abi.decode(r,(uint256));}
 function testContinuousBothOrderingsAndRealizedFees()public{
  if(!fork())return;
  for(uint256 side=0;side<2;side++){
   GrainMetadataDexFactory f=new GrainMetadataDexFactory();planningFactory=f;GrainMetadataDexFactory.LaunchRequest memory r;bool found;
   for(uint256 s=1;s<1024;s++){r=req(s,0);if((f.predictToken(r)<WETH)==(side==0)){found=true;break;}}require(found,'ordering');
   (address token,uint256 dev)=f.createAndLaunch(r);require(dev==0,'zero buy');address pool=f.poolOf(r.launchId);require(IERC20(WETH).balanceOf(pool)==0,'no issuer quote');
   GrainMainnetDexLocker locker=GrainMainnetDexLocker(f.lockerOf(r.launchId));uint256 id=f.positionIdOf(r.launchId);DexNpm npm=DexNpm(address(f.npm()));require(npm.ownerOf(id)==address(locker),'locked');
   (,,,,,,,uint128 liqBefore,,,,)=npm.positions(id);
   uint256 bought=buy(token,5 ether);require(bought>800_000_000 ether,'continues beyond old graduation');
   IERC20(token).approve(ROUTER,bought);
   (bool ok,bytes memory ret)=ROUTER.call(abi.encodeWithSignature('exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))',token,WETH,uint24(10000),address(this),bought,uint256(1),uint160(0)));require(ok&&abi.decode(ret,(uint256))>0,'sell');
   locker.collect();uint256 wf=locker.platformOwed(WETH)+locker.creatorOwed(WETH);uint256 tf=locker.platformOwed(token)+locker.creatorOwed(token);
   require(wf>0&&tf>0&&locker.platformOwed(WETH)==wf*35/100&&locker.platformOwed(token)==tf*35/100,'realized split');
   uint256 before=IERC20(WETH).balanceOf(address(this));uint256 owed=locker.creatorOwed(WETH);locker.claim(WETH,true);require(IERC20(WETH).balanceOf(address(this))==before+owed,'claim');
   (,,,,,,,uint128 liqAfter,,,,)=npm.positions(id);require(liqAfter==liqBefore,'principal unchanged');
   (bool migrated,)=address(locker).call(abi.encodeWithSignature('transition()'));require(!migrated,'no migration surface');
  }
 }
 function testAtomicCreatorBuyAndDuplicate()public{
  if(!fork())return;GrainMetadataDexFactory f=new GrainMetadataDexFactory();planningFactory=f;GrainMetadataDexFactory.LaunchRequest memory r=req(1,1);
  (address token,uint256 out)=f.createAndLaunch{value:0.01 ether}(r);require(out>0&&IERC20(token).balanceOf(address(this))==out,'devbuy');
  require(IERC20(token).totalSupply()==1_000_000_000 ether,'supply');
  try f.createAndLaunch(r){revert('duplicate accepted');}catch(bytes memory reason){require(bytes4(reason)==GrainMetadataDexFactory.DuplicateLaunch.selector,'duplicate');}
  r=req(2,type(uint256).max);try f.createAndLaunch{value:0.01 ether}(r){revert('bad minimum accepted');}catch{}require(f.tokenOf(r.launchId)==address(0),'atomic rollback');
 }
 function testDonationsCannotPoisonLaunchOrBecomeClaimableFees()public{
  if(!fork())return;GrainMetadataDexFactory f=new GrainMetadataDexFactory();planningFactory=f;
  (bool wrapped,)=WETH.call{value:0.1 ether}(abi.encodeWithSignature("deposit()"));require(wrapped,"wrap");IERC20(WETH).transfer(address(f),0.1 ether);
  GrainMetadataDexFactory.LaunchRequest memory r=req(9,1);(address token,uint256 out)=f.createAndLaunch{value:0.01 ether}(r);require(out>0&&IERC20(WETH).balanceOf(address(f))==0.1 ether,"donation preserved");
  GrainMainnetDexLocker l=GrainMainnetDexLocker(f.lockerOf(r.launchId));
  IERC20(token).transfer(address(l),1 ether);
  (wrapped,)=WETH.call{value:0.1 ether}(abi.encodeWithSignature("deposit()"));require(wrapped,"wrap2");IERC20(WETH).transfer(address(l),0.1 ether);
  l.collect();uint256 wf=l.creatorOwed(WETH)+l.platformOwed(WETH);require(wf>0&&wf<=0.0001 ether,"only swap fees");require(l.creatorOwed(token)+l.platformOwed(token)==0,"donation not fees");
  vm.prank(address(0x999));try l.claim(WETH,true){revert("wrong claimant");}catch{}
  l.claim(WETH,true);try l.claim(WETH,true){revert("double claim");}catch{}
  uint256 p=l.platformOwed(WETH);uint256 before=IERC20(WETH).balanceOf(f.platform());vm.prank(f.platform());l.claim(WETH,false);require(IERC20(WETH).balanceOf(f.platform())==before+p,"platform receives bound amount");
  require(IERC20(WETH).balanceOf(address(l))>=0.1 ether&&IERC20(token).balanceOf(address(l))>=1 ether,"donations stay locked");
 }

 function testExactCallbackAndRenewalLimits()public{
  if(!fork())return;GrainMetadataDexFactory f=new GrainMetadataDexFactory();planningFactory=f;
  (bool ok,bytes memory reason)=address(f).call(abi.encodeWithSignature('uniswapV3SwapCallback(int256,int256,bytes)',int256(1),int256(0),hex''));
  require(!ok&&bytes4(reason)==GrainMetadataDexFactory.BadCallback.selector,'outside callback');
  GrainMetadataDexFactory.LaunchRequest memory r=req(77,0);f.createAndLaunch(r);
  for(uint256 i=0;i<16;i++)f.renewRegistration(r.launchId,uint64(block.timestamp+1 days));
  try f.renewRegistration(r.launchId,uint64(block.timestamp+1 days)){revert('renewal cap');}catch(bytes memory why){require(bytes4(why)==GrainMetadataDexFactory.RenewalLimit.selector,'renewal selector');}
 }
 function testExactPreinitializedPoolFailsAndFreshIdRecovers()public{
  if(!fork())return;GrainMetadataDexFactory f=new GrainMetadataDexFactory();planningFactory=f;
  for(uint256 side=0;side<2;side++){
   GrainMetadataDexFactory.LaunchRequest memory r;bool found;
   for(uint256 salt=100+side*1000;salt<1100+side*1000;salt++){r=req(salt,0);if((f.predictToken(r)<WETH)==(side==0)){found=true;break;}}require(found,'find side');
   address token=f.predictToken(r);address t0=token<WETH?token:WETH;address t1=token<WETH?WETH:token;
   f.npm().createAndInitializePoolIfNecessary(t0,t1,10000,uint160(1<<96));
   try f.createAndLaunch(r){revert('poison accepted');}catch(bytes memory why){require(bytes4(why)==GrainMetadataDexFactory.PoolNotFresh.selector,'freshness selector');}
   require(f.tokenOf(r.launchId)==address(0),'no partial launch');
   r=req(10000+side,1);(address created,uint256 out)=f.createAndLaunch{value:0.001 ether}(r);require(created!=address(0)&&out>0,'fresh id recovery');
  }
 }

 function testExactCreatorBuyBothOrientationsAndPartialFillReverts()public{
  if(!fork())return;GrainMetadataDexFactory f=new GrainMetadataDexFactory();planningFactory=f;
  for(uint256 side=0;side<2;side++){
   GrainMetadataDexFactory.LaunchRequest memory r;bool found;
   for(uint256 salt=30000+side*1000;salt<31000+side*1000;salt++){r=req(salt,1);if((f.predictToken(r)<WETH)==(side==0)){found=true;break;}}require(found,'orientation');
   (address token,uint256 out)=f.createAndLaunch{value:0.001 ether}(r);require(out>0&&IERC20(token).balanceOf(address(this))==out,'atomic side buy');
  }
  vm.deal(address(this),1e25 ether);GrainMetadataDexFactory.LaunchRequest memory excessive=req(50000,0);
  try f.createAndLaunch{value:1e24 ether}(excessive){revert('partial fill accepted');}catch(bytes memory reason){require(bytes4(reason)==GrainMetadataDexFactory.BuyExceedsRange.selector,'partial fill selector');}
  require(f.tokenOf(excessive.launchId)==address(0),'partial fill rollback');
 }

}
